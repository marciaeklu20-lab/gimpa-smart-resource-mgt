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

import { FaTools, FaSpinner, FaCheckCircle, FaWrench } from "react-icons/fa";

const db = getFirestore(app);

export default function MaintenanceDashboard() {

  const [inMaintenanceCount, setInMaintenanceCount] = useState(0);

  // Live count of resources currently in lifecycleStatus ==
  // in_maintenance. The other three KPI tiles (Open Faults / In
  // Progress / Resolved This Week) come online in Stage 4d alongside
  // the faults collection.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, "resources"),
        where("lifecycleStatus", "==", "in_maintenance")
      ),
      (snap) => setInMaintenanceCount(snap.size),
      (err) => console.error("Assets under maintenance listener:", err)
    );
    return () => unsubscribe();
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
          value={0}
          placeholder
        />

        <KpiCard
          icon={<FaSpinner size={22} />}
          label="In Progress"
          value={0}
          placeholder
        />

        <KpiCard
          icon={<FaCheckCircle size={22} />}
          label="Resolved This Week"
          value={0}
          placeholder
        />

        <KpiCard
          icon={<FaWrench size={22} />}
          label="Assets Under Maintenance"
          value={inMaintenanceCount}
        />

      </div>

    </div>

  );

}

function KpiCard({ icon, label, value, placeholder }) {
  return (
    <div className={`maintenance-kpi-card ${placeholder ? "placeholder" : ""}`}>
      <div className="maintenance-kpi-icon">{icon}</div>
      <div className="maintenance-kpi-body">
        <div className="maintenance-kpi-value">{value}</div>
        <div className="maintenance-kpi-label">{label}</div>
        {placeholder && (
          <div className="maintenance-kpi-coming">Coming in Stage 4d</div>
        )}
      </div>
    </div>
  );
}
