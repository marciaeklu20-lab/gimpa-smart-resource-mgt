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

import { relativeTime } from "@/app/lib/resourceMeta";

const db = getFirestore(app);

const STATUS_LABEL = {
  pending:      "Pending",
  approved:     "Approved",
  rejected:     "Rejected",
  acknowledged: "Acknowledged",
  in_progress:  "In progress",
  resolved:     "Resolved",
  closed:       "Closed"
};

// Booking is considered "active" when it's approved AND its end has
// not yet passed. Bookings can store the end as either an ISO string
// or a Firestore Timestamp depending on Stage; tolerate both so
// legacy + new docs both count correctly.
const bookingIsActive = (b, nowMs) => {
  if (b.status !== "approved") return false;
  const end = b.endDate ?? b.endsAt ?? null;
  if (!end) return true;
  if (typeof end === "string") {
    const t = new Date(end).getTime();
    return Number.isFinite(t) ? t >= nowMs : true;
  }
  if (typeof end?.toMillis === "function") {
    return end.toMillis() >= nowMs;
  }
  return true;
};

export default function BookerDashboard({ currentUser, navigate }) {

  const uid = currentUser?.uid;

  const [bookings, setBookings] = useState([]);
  const [faults, setFaults] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  // Live own-bookings: the requesterId == auth.uid branch of the
  // Firestore rules permits this on the auto-indexed single-field
  // query — no composite index needed.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "bookings"),
        where("requesterId", "==", uid)
      ),
      (snap) => setBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("BookerDashboard bookings listener:", err)
    );
    return () => unsub();
  }, [uid]);

  // Live own-faults — same pattern; the reporter rule branch covers
  // it without any new index.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "faults"),
        where("reporterId", "==", uid)
      ),
      (snap) => setFaults(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("BookerDashboard faults listener:", err)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const activeCount = useMemo(
    () => bookings.filter((b) => bookingIsActive(b, now)).length,
    [bookings, now]
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending").length,
    [bookings]
  );

  // Group faults by status so the breakdown line under "My faults"
  // tells the booker what's outstanding without clicking through.
  const faultStatusCounts = useMemo(() => {
    const totals = { pending: 0, in_progress: 0, resolved: 0, other: 0 };
    for (const f of faults) {
      if (f.status === "pending" || f.status === "acknowledged") {
        totals.pending += 1;
      } else if (f.status === "in_progress") {
        totals.in_progress += 1;
      } else if (f.status === "resolved") {
        totals.resolved += 1;
      } else {
        totals.other += 1;
      }
    }
    return totals;
  }, [faults]);

  // Recent resources I've booked: the last 5 distinct resourceIds
  // from MY bookings, ordered by booking createdAt. Click navigates
  // to the asset's detail in Resource Management.
  const recentResources = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      const ams = a.createdAt?.toMillis?.() || 0;
      const bms = b.createdAt?.toMillis?.() || 0;
      return bms - ams;
    });
    const seen = new Set();
    const out = [];
    for (const b of sorted) {
      if (!b.resourceId || seen.has(b.resourceId)) continue;
      seen.add(b.resourceId);
      out.push({
        resourceId: b.resourceId,
        resourceName: b.resourceName || b.resourceId,
        lastBookedAt: b.createdAt
      });
      if (out.length >= 5) break;
    }
    return out;
  }, [bookings]);

  // Activity feed: own bookings (any status) and own faults, merged
  // and sorted. Booking actions are surfaced via status + timestamp;
  // faults via severity + status.
  const activity = useMemo(() => {
    const items = [];
    for (const b of bookings) {
      items.push({
        kind: "booking",
        id: `b-${b.id}`,
        title: b.purpose || b.resourceName || "Booking",
        subtitle:
          `${b.resourceName || b.resourceId || "Resource"}`
          + ` · ${STATUS_LABEL[b.status] || b.status}`,
        timestamp: b.createdAt,
        onClick: () => navigate?.({
          sidebar: "Resource Management",
          tab: "Bookings",
          expandedId: b.id
        })
      });
    }
    for (const f of faults) {
      items.push({
        kind: "fault",
        id: `f-${f.id}`,
        title: f.resourceName || "Fault",
        subtitle: `${f.severity} · ${STATUS_LABEL[f.status] || f.status}`,
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
  }, [bookings, faults, navigate]);

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  return (

    <div className="dashboard-container">

      <div className="dashboard-header dashboard-header-with-action">
        <div>
          <h1 className="dashboard-greeting">Welcome, {firstName}</h1>
          <p className="dashboard-subtitle">
            Your bookings, faults you&apos;ve reported, and what to do next.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-quick-action"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Campus Resources"
          })}
        >
          + New booking
        </button>
      </div>

      <div className="dashboard-rm-kpi-strip">

        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "approved" }
          })}
        >
          <div className="dashboard-kpi-label">My active bookings</div>
          <div className="dashboard-kpi-value">{activeCount}</div>
          <div className="dashboard-kpi-sub">
            {activeCount === 0
              ? "No active bookings."
              : "Approved + still upcoming."}
          </div>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "pending" }
          })}
        >
          <div className="dashboard-kpi-label">My pending bookings</div>
          <div className="dashboard-kpi-value">{pendingCount}</div>
          <div className="dashboard-kpi-sub">
            {pendingCount === 0
              ? "Nothing waiting on approvers."
              : "Waiting on approvers."}
          </div>
        </button>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Faults I&apos;ve reported</div>
          <div className="dashboard-kpi-value">{faults.length}</div>
          <ul className="dashboard-kpi-breakdown">
            {faultStatusCounts.pending > 0 && (
              <li><span>Pending</span><span>{faultStatusCounts.pending}</span></li>
            )}
            {faultStatusCounts.in_progress > 0 && (
              <li><span>In progress</span><span>{faultStatusCounts.in_progress}</span></li>
            )}
            {faultStatusCounts.resolved > 0 && (
              <li><span>Resolved</span><span>{faultStatusCounts.resolved}</span></li>
            )}
            {faults.length === 0 && (
              <li className="dashboard-kpi-empty">No reports yet.</li>
            )}
          </ul>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Recent resources I&apos;ve booked</div>
          {recentResources.length === 0 ? (
            <div className="dashboard-kpi-empty">
              You haven&apos;t booked anything yet.
            </div>
          ) : (
            <ul className="dashboard-resource-list">
              {recentResources.map((r) => (
                <li key={r.resourceId}>
                  <button
                    type="button"
                    className="dashboard-resource-row"
                    onClick={() => navigate?.({
                      sidebar: "Resource Management",
                      tab: "Campus Resources",
                      assetId: r.resourceId
                    })}
                  >
                    <span className="dashboard-resource-name">
                      {r.resourceName}
                    </span>
                    <span className="dashboard-resource-time">
                      {r.lastBookedAt ? relativeTime(r.lastBookedAt, now) : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <div className="dashboard-empty-card">
            Once you submit a booking or report a fault, it&apos;ll show
            up here.
          </div>
        ) : (
          <ul className="dashboard-activity-list">
            {activity.map((item) => (
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
