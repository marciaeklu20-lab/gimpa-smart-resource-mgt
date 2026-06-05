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

import RecentActivity from "@/app/workspace/analytics/RecentActivity";

import { RESOURCE_MANAGERS } from "@/app/lib/roles";

const db = getFirestore(app);

const todayISODate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Stage 4g: visualise the Stage 4e.7 responsibility split. Six tiles —
// four resource managers (counts of resources they own), one
// maintenance-side queue (admin-visible faults), and an overall
// bookings tally. All counts come from collection-wide listeners
// because PLATFORM_ADMINS already have read access to everything.
export default function PlatformDashboard({ currentUser, navigate }) {

  const [pendingCount, setPendingCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [allBookingsCount, setAllBookingsCount] = useState(0);

  const [resources, setResources] = useState([]);
  const [maintenanceQueueCount, setMaintenanceQueueCount] = useState(0);

  useEffect(() => {
    const unsubs = [];

    unsubs.push(onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "pending")),
      (snap) => setPendingCount(snap.size)
    ));

    unsubs.push(onSnapshot(
      collection(db, "bookings"),
      (snap) => {
        setAllBookingsCount(snap.size);
        const today = todayISODate();
        const count = snap.docs.filter((d) => {
          const start = d.data().startDate;
          return typeof start === "string" && start.startsWith(today);
        }).length;
        setTodayCount(count);
      }
    ));

    // Resource roster — feeds the per-role tile counts. Admins can
    // read the whole collection.
    unsubs.push(onSnapshot(
      collection(db, "resources"),
      (snap) => setResources(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      )
    ));

    // Maintenance Admin queue — faults still on the workflow path
    // (pending / acknowledged / in_progress). Matches what the
    // maintenance team triages day-to-day.
    unsubs.push(onSnapshot(
      query(
        collection(db, "faults"),
        where("status", "in", ["pending", "acknowledged", "in_progress"])
      ),
      (snap) => setMaintenanceQueueCount(snap.size)
    ));

    return () => unsubs.forEach((u) => u());
  }, []);

  // Tally resources per managing role. Resources without a
  // responsibleRole (legacy / pre-4e.7) fall into "Unassigned" and are
  // shown only when non-zero.
  const countByRole = useMemo(() => {
    const totals = {};
    for (const role of RESOURCE_MANAGERS) totals[role] = 0;
    let unassigned = 0;
    for (const r of resources) {
      if (r.responsibleRole && totals[r.responsibleRole] != null) {
        totals[r.responsibleRole] += 1;
      } else {
        unassigned += 1;
      }
    }
    return { totals, unassigned };
  }, [resources]);

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  return (

    <div className="dashboard-container">

      <div className="dashboard-header">
        <h1 className="dashboard-greeting">Welcome back, {firstName}</h1>
        <p className="dashboard-subtitle">
          Here&apos;s what&apos;s happening across GIMPA today.
        </p>
      </div>

      <div className="dashboard-quick-stats">

        <button
          type="button"
          className="dashboard-stat-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "pending" }
          })}
        >
          <div className="dashboard-stat-value">{pendingCount}</div>
          <div className="dashboard-stat-label">Pending approvals</div>
        </button>

        <button
          type="button"
          className="dashboard-stat-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { dateKey: todayISODate() }
          })}
        >
          <div className="dashboard-stat-value">{todayCount}</div>
          <div className="dashboard-stat-label">Bookings today</div>
        </button>

      </div>

      {/* Stage 4g: Responsibility Breakdown — surfaces who owns what
          at a glance. Each role tile is a button so future iterations
          can route to a pre-filtered view of that role's slice. */}
      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Responsibility breakdown</h2>
        <div className="dashboard-breakdown-grid">

          {RESOURCE_MANAGERS.map((role) => (
            <div className="dashboard-breakdown-tile" key={role}>
              <div className="dashboard-breakdown-role">{role}</div>
              <div className="dashboard-breakdown-value">
                {countByRole.totals[role] ?? 0}
              </div>
              <div className="dashboard-breakdown-meta">
                resource{(countByRole.totals[role] ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
          ))}

          <div className="dashboard-breakdown-tile">
            <div className="dashboard-breakdown-role">Maintenance Admin</div>
            <div className="dashboard-breakdown-value">
              {maintenanceQueueCount}
            </div>
            <div className="dashboard-breakdown-meta">
              fault{maintenanceQueueCount === 1 ? "" : "s"} in queue
            </div>
          </div>

          <div className="dashboard-breakdown-tile">
            <div className="dashboard-breakdown-role">Total bookings</div>
            <div className="dashboard-breakdown-value">{allBookingsCount}</div>
            <div className="dashboard-breakdown-meta">across the platform</div>
          </div>

          {countByRole.unassigned > 0 && (
            <div className="dashboard-breakdown-tile dashboard-breakdown-warning">
              <div className="dashboard-breakdown-role">Unassigned</div>
              <div className="dashboard-breakdown-value">
                {countByRole.unassigned}
              </div>
              <div className="dashboard-breakdown-meta">
                resource{countByRole.unassigned === 1 ? "" : "s"} without
                {" "}a responsibleRole
              </div>
            </div>
          )}

        </div>
      </section>

      <div className="dashboard-activity-wrapper">
        <RecentActivity navigate={navigate} />
      </div>

    </div>

  );

}
