"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";

import {
  categoriesForRole
} from "@/app/lib/categoryResponsibility";

import {
  CONDITIONS,
  LIFECYCLE_STATUSES,
  conditionLabel,
  lifecycleLabel,
  relativeTime
} from "@/app/lib/resourceMeta";

import { subscribeBookings } from "@/app/workspace/resource-management/services/subscribeBookings";
import { subscribeFaults } from "@/app/workspace/maintenance/services/subscribeFaults";

const db = getFirestore(app);

// Recharts slice colours mirror the .pill-condition-* tokens so the
// distribution chart reads consistently against the asset detail
// panels' condition pills. Kept in sync by hand.
const CONDITION_FILL = {
  excellent:      "#34d399",
  good:           "#22c55e",
  fair:           "#f59e0b",
  poor:           "#f97316",
  out_of_service: "#ef4444"
};

const SEVERITY_DOT = {
  cosmetic: "#94a3b8",
  minor:    "#0ea5e9",
  major:    "#f59e0b",
  critical: "#ef4444"
};

export default function ResourceManagerDashboard({ currentUser, navigate }) {

  const role = currentUser?.role;
  const myCategories = useMemo(() => categoriesForRole(role), [role]);
  const isStores = role === "Stores/Inventory Officer";

  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [faults, setFaults] = useState([]);
  const [pendingSupplyCount, setPendingSupplyCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Resources I own — server-side filter on the denormalised
  // responsibleRole field set by Stage 4e.7. Cheap to query and the
  // result set is small enough to power every KPI below client-side.
  useEffect(() => {
    if (!role) return;
    const unsub = onSnapshot(
      query(
        collection(db, "resources"),
        where("responsibleRole", "==", role)
      ),
      (snap) => setResources(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("ResourceManagerDashboard resources listener:", err)
    );
    return () => unsub();
  }, [role]);

  // Bookings come via the shared subscribeBookings helper which
  // already handles role-based visibility (approvalRoutedTo +
  // own-booking union). Filtering to "my" bookings happens client-
  // side below — the alternative (denormalising responsibleRole onto
  // bookings) is out of scope per Stage 4g spec.
  useEffect(() => {
    if (!currentUser?.uid || !role) return;
    const unsub = subscribeBookings({
      user: currentUser,
      onUpdate: setBookings
    });
    return () => unsub();
  }, [currentUser?.uid, role]);

  // Faults: subscribeFaults returns all faults for maintenance roles
  // and only the user's reports otherwise. Resource Managers (this
  // component's audience) are NOT in routedToRoles, so the listener
  // only surfaces faults they themselves reported. Acceptable demo
  // behaviour — extending visibility would require a rule change
  // (out of scope) or a schema change (denormalising responsibleRole
  // onto faults, also out of scope).
  useEffect(() => {
    if (!currentUser?.uid || !role) return;
    const unsub = subscribeFaults({
      user: currentUser,
      onUpdate: setFaults
    });
    return () => unsub();
  }, [currentUser?.uid, role]);

  // Stores-only — pending supply request count for the 5th card.
  useEffect(() => {
    if (!isStores) {
      setPendingSupplyCount(0);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "supplyRequests"),
        where("status", "==", "pending")
      ),
      (snap) => setPendingSupplyCount(snap.size),
      (err) => console.error("ResourceManagerDashboard supply listener:", err)
    );
    return () => unsub();
  }, [isStores]);

  // Tick the wall clock so "5 minutes ago" stays current without
  // refetching. Matches the pattern in FaultsList/AssetDetailPanel.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Filter helpers — every KPI scoped to MY resource set.
  const resourceIds = useMemo(
    () => new Set(resources.map((r) => r.id || r.assetCode)),
    [resources]
  );

  const pendingBookingsOnMine = useMemo(
    () => bookings.filter((b) =>
      b.status === "pending"
      && resourceIds.has(b.resourceId)
    ),
    [bookings, resourceIds]
  );

  const recentFaultsOnMine = useMemo(
    () => faults
      .filter((f) => resourceIds.has(f.resourceId))
      .sort((a, b) => {
        const ams = a.createdAt?.toMillis?.() || 0;
        const bms = b.createdAt?.toMillis?.() || 0;
        return bms - ams;
      })
      .slice(0, 5),
    [faults, resourceIds]
  );

  // Lifecycle breakdown for KPI A.
  const lifecycleBreakdown = useMemo(() => {
    const totals = {};
    for (const s of LIFECYCLE_STATUSES) totals[s.value] = 0;
    for (const r of resources) {
      const v = r.lifecycleStatus || "active";
      if (totals[v] != null) totals[v] += 1;
    }
    return totals;
  }, [resources]);

  // Condition distribution for the chart. Empty buckets are removed so
  // the donut never renders zero-width slices.
  const conditionData = useMemo(() => {
    const totals = {};
    for (const c of CONDITIONS) totals[c.value] = 0;
    for (const r of resources) {
      const v = r.condition || "good";
      if (totals[v] != null) totals[v] += 1;
    }
    return CONDITIONS
      .map((c) => ({
        name: c.label,
        value: totals[c.value],
        fill: CONDITION_FILL[c.value] || "#94a3b8"
      }))
      .filter((d) => d.value > 0);
  }, [resources]);

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  // Recent activity feed — light-weight merge of bookings + faults
  // on MY resources, sorted by their canonical timestamp. Resource
  // history subcollections (conditionHistory/lifecycleHistory) would
  // be a separate cross-collection-group query and aren't worth the
  // complexity for the demo — bookings + faults already cover the
  // 80% case.
  const activityFeed = useMemo(() => {
    const items = [];

    for (const b of bookings) {
      if (!resourceIds.has(b.resourceId)) continue;
      items.push({
        kind: "booking",
        id: `b-${b.id}`,
        title: b.purpose || "Booking",
        subtitle: `${b.requesterName || b.requesterEmail || "Unknown"} · ${b.status}`,
        timestamp: b.createdAt,
        onClick: () => navigate?.({
          sidebar: "Resource Management",
          tab: "Bookings",
          expandedId: b.id
        })
      });
    }

    for (const f of faults) {
      if (!resourceIds.has(f.resourceId)) continue;
      items.push({
        kind: "fault",
        id: `f-${f.id}`,
        title: f.resourceName || "Fault",
        subtitle: `${f.severity} · ${f.status}`,
        timestamp: f.createdAt,
        onClick: () => navigate?.({ faultId: f.id })
      });
    }

    return items
      .sort((a, b) => {
        const ams = a.timestamp?.toMillis?.() || 0;
        const bms = b.timestamp?.toMillis?.() || 0;
        return bms - ams;
      })
      .slice(0, 10);
  }, [bookings, faults, resourceIds, navigate]);

  return (

    <div className="dashboard-container">

      <div className="dashboard-header">
        <h1 className="dashboard-greeting">Welcome back, {firstName}</h1>
        <p className="dashboard-subtitle">
          <strong>My Categories:</strong>
          {" "}
          {myCategories.length > 0
            ? myCategories.join(", ")
            : "—"}
        </p>
      </div>

      <div className="dashboard-rm-kpi-strip">

        {/* A. Resources in my categories */}
        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Campus Resources"
          })}
        >
          <div className="dashboard-kpi-label">Resources in my categories</div>
          <div className="dashboard-kpi-value">{resources.length}</div>
          <ul className="dashboard-kpi-breakdown">
            {LIFECYCLE_STATUSES.map((s) => (
              lifecycleBreakdown[s.value] > 0 && (
                <li key={s.value}>
                  <span>{lifecycleLabel(s.value)}</span>
                  <span>{lifecycleBreakdown[s.value]}</span>
                </li>
              )
            ))}
          </ul>
        </button>

        {/* B. Bookings pending my approval */}
        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "pending" }
          })}
        >
          <div className="dashboard-kpi-label">Bookings pending my approval</div>
          <div className="dashboard-kpi-value">{pendingBookingsOnMine.length}</div>
          <div className="dashboard-kpi-sub">
            {pendingBookingsOnMine.length === 0
              ? "Queue is clear."
              : "Click to open the queue."}
          </div>
        </button>

        {/* C. Condition distribution */}
        <div className="dashboard-kpi-card dashboard-kpi-chart-card">
          <div className="dashboard-kpi-label">Condition distribution</div>
          {conditionData.length === 0 ? (
            <div className="dashboard-kpi-empty">No resources yet.</div>
          ) : (
            <div className="dashboard-kpi-chart">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={conditionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={64}
                    paddingAngle={2}
                  >
                    {conditionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    iconSize={10}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: "0.78rem" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* D. Recent faults on my assets */}
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Recent faults on my assets</div>
          {recentFaultsOnMine.length === 0 ? (
            <div className="dashboard-kpi-empty">
              No faults visible to you on these assets.
            </div>
          ) : (
            <ul className="dashboard-fault-list">
              {recentFaultsOnMine.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="dashboard-fault-row"
                    onClick={() => navigate?.({ faultId: f.id })}
                  >
                    <span
                      className="dashboard-fault-dot"
                      style={{
                        background: SEVERITY_DOT[f.severity] || "#94a3b8"
                      }}
                    />
                    <span className="dashboard-fault-title">
                      {f.resourceName}
                    </span>
                    <span className="dashboard-fault-time">
                      {f.createdAt ? relativeTime(f.createdAt, now) : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* E. Pending supply requests — Stores-only fifth card. */}
        {isStores && (
          <button
            type="button"
            className="dashboard-kpi-card"
            onClick={() => navigate?.({
              sidebar: "Resource Management",
              tab: "Supply Requests"
            })}
          >
            <div className="dashboard-kpi-label">Pending supply requests</div>
            <div className="dashboard-kpi-value">{pendingSupplyCount}</div>
            <div className="dashboard-kpi-sub">
              {pendingSupplyCount === 0
                ? "No pending requests."
                : "Click to review them."}
            </div>
          </button>
        )}

      </div>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Recent activity on your assets</h2>
        {activityFeed.length === 0 ? (
          <div className="dashboard-empty-card">
            No recent activity on your resources yet.
          </div>
        ) : (
          <ul className="dashboard-activity-list">
            {activityFeed.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="dashboard-activity-row"
                  onClick={item.onClick}
                >
                  <span
                    className={`dashboard-activity-kind dashboard-activity-kind-${item.kind}`}
                  >
                    {item.kind === "booking" ? "Booking" : "Fault"}
                  </span>
                  <span className="dashboard-activity-title">
                    {item.title}
                  </span>
                  <span className="dashboard-activity-sub">
                    {item.subtitle}
                  </span>
                  <span className="dashboard-activity-time">
                    {item.timestamp ? relativeTime(item.timestamp, now) : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
