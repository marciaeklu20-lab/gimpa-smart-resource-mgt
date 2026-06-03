"use client";

import { useState } from "react";

import MaintenanceDashboard from "./MaintenanceDashboard";
import FaultsList from "./FaultsList";
import MaintenanceLog from "./MaintenanceLog";

import "@/app/styles/workspace/maintenance.css";

const TABS = ["Dashboard", "Faults", "Maintenance Log"];

export default function Maintenance({ currentUser, navigate }) {

  // Internal sub-tab state — does NOT use the page-level activeTab,
  // which is dedicated to Resource Management / Admin Dashboard.
  const [activeTab, setActiveTab] = useState("Dashboard");

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

      {activeTab === "Faults" && <FaultsList navigate={navigate} />}

      {activeTab === "Maintenance Log" && <MaintenanceLog />}

    </div>

  );
}
