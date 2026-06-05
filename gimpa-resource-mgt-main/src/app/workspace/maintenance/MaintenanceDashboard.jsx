"use client";

import { useEffect, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { FaTools, FaSpinner, FaCheckCircle, FaWrench, FaUserSlash, FaBoxOpen } from "react-icons/fa";

const db = getFirestore(app);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function MaintenanceDashboard() {

  const [openFaultsCount, setOpenFaultsCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [resolvedThisWeekCount, setResolvedThisWeekCount] = useState(0);
  const [inMaintenanceCount, setInMaintenanceCount] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [pendingSupplyCount, setPendingSupplyCount] = useState(0);

  // Four parallel listeners: 3 over /faults (Stage 4d) + 1 over
  // /resources (Stage 4c). All four unsubscribes are returned in a
  // single cleanup so React tears them all down on unmount.
  useEffect(() => {
    const unsubs = [];

    // Open faults — anything still actionable (pending or acknowledged).
    unsubs.push(onSnapshot(
      query(
        collection(db, "faults"),
        where("status", "in", ["pending", "acknowledged"])
      ),
      (snap) => setOpenFaultsCount(snap.size),
      (err) => console.error("Open faults listener:", err)
    ));

    // Currently being worked.
    unsubs.push(onSnapshot(
      query(
        collection(db, "faults"),
        where("status", "==", "in_progress")
      ),
      (snap) => setInProgressCount(snap.size),
      (err) => console.error("In-progress faults listener:", err)
    ));

    // Resolved in the last 7 days. The listener filters by status
    // server-side; the 7-day window is applied client-side so we don't
    // need yet another composite index.
    unsubs.push(onSnapshot(
      query(
        collection(db, "faults"),
        where("status", "==", "resolved")
      ),
      (snap) => {
        const cutoff = Date.now() - SEVEN_DAYS_MS;
        const count = snap.docs.reduce((n, d) => {
          const t = d.data().resolvedAt;
          const ms = t?.toMillis ? t.toMillis() : 0;
          return ms >= cutoff ? n + 1 : n;
        }, 0);
        setResolvedThisWeekCount(count);
      },
      (err) => console.error("Resolved-this-week listener:", err)
    ));

    // Assets currently flagged in_maintenance — Stage 4c KPI, kept
    // as-is.
    unsubs.push(onSnapshot(
      query(
        collection(db, "resources"),
        where("lifecycleStatus", "==", "in_maintenance")
      ),
      (snap) => setInMaintenanceCount(snap.size),
      (err) => console.error("Assets under maintenance listener:", err)
    ));

    // Stage 4e.5: unassigned, still-actionable faults. Firestore's
    // "==" treats missing fields as null and matches them too, so this
    // single listener covers both legacy faults without the field and
    // faults explicitly released to null. Pre-stage-4e.5 faults still
    // count as unassigned, which is correct.
    unsubs.push(onSnapshot(
      query(
        collection(db, "faults"),
        where("status", "in", ["pending", "acknowledged"]),
        where("assignedTo", "==", null)
      ),
      (snap) => setUnassignedCount(snap.size),
      (err) => console.error("Unassigned faults listener:", err)
    ));

    // Stage 4e.8: pending supply requests across the org. Visible to
    // every maintenance-domain user (rules let them read all supply
    // requests).
    unsubs.push(onSnapshot(
      query(
        collection(db, "supplyRequests"),
        where("status", "==", "pending")
      ),
      (snap) => setPendingSupplyCount(snap.size),
      (err) => console.error("Pending supply requests listener:", err)
    ));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  return (

    <div className="maintenance-dashboard">

      <header className="maintenance-header">
        <h1>Maintenance Operations</h1>
        <p>
          Your operational view of fault tickets, asset condition,
          and maintenance activity across GIMPA.
        </p>
      </header>

      <div className="maintenance-kpi-strip">

        <KpiCard
          icon={<FaTools size={22} />}
          label="Open Faults"
          value={openFaultsCount}
        />

        <KpiCard
          icon={<FaSpinner size={22} />}
          label="In Progress"
          value={inProgressCount}
        />

        <KpiCard
          icon={<FaCheckCircle size={22} />}
          label="Resolved This Week"
          value={resolvedThisWeekCount}
        />

        <KpiCard
          icon={<FaWrench size={22} />}
          label="Assets Under Maintenance"
          value={inMaintenanceCount}
        />

        <KpiCard
          icon={<FaUserSlash size={22} />}
          label="Unassigned Faults"
          value={unassignedCount}
        />

        <KpiCard
          icon={<FaBoxOpen size={22} />}
          label="Pending Supply Requests"
          value={pendingSupplyCount}
        />

      </div>

    </div>

  );

}

function KpiCard({ icon, label, value }) {
  return (
    <div className="maintenance-kpi-card">
      <div className="maintenance-kpi-icon">{icon}</div>
      <div className="maintenance-kpi-body">
        <div className="maintenance-kpi-value">{value}</div>
        <div className="maintenance-kpi-label">{label}</div>
      </div>
    </div>
  );
}
