"use client";

import { useEffect, useState } from "react";

import MaintenanceDashboard from "./MaintenanceDashboard";
import FaultsList from "./FaultsList";
import MaintenanceLog from "./MaintenanceLog";
import SupplyRequestsList from "./supplyRequest/SupplyRequestsList";

import "@/app/styles/workspace/maintenance.css";

const TABS = ["Dashboard", "Faults", "Supply Requests", "Maintenance Log"];

export default function Maintenance({ currentUser, navigate, initialFaultId }) {

  // Internal sub-tab state — does NOT use the page-level activeTab,
  // which is dedicated to Resource Management / Admin Dashboard.
  const [activeTab, setActiveTab] = useState("Dashboard");

  // Stage 4f: when the parent passes a fault-id deep-link, force the
  // Faults sub-tab so the user lands directly on the selected fault
  // instead of the dashboard. Re-runs on every new id so a second
  // navigation also lands correctly.
  useEffect(() => {
    if (initialFaultId) {
      setActiveTab("Faults");
    }
  }, [initialFaultId]);

  return (

    <div className="maintenance-module">

      {/* Reuse the Resource-Management tab styles so the sub-tab bar
          looks identical across modules. */}
      <div className="resource-management-tabs-container">
        {TABS.map((tab) => (
          <div
            key={tab}
            className={`resource-management-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      {activeTab === "Dashboard" && (
        <MaintenanceDashboard currentUser={currentUser} />
      )}

      {activeTab === "Faults" && (
        <FaultsList navigate={navigate} initialFaultId={initialFaultId} />
      )}

      {activeTab === "Supply Requests" && (
        <SupplyRequestsList navigate={navigate} />
      )}

      {activeTab === "Maintenance Log" && <MaintenanceLog />}

    </div>

  );
}
