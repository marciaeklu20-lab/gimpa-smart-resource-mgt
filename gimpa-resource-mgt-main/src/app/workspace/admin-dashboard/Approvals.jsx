"use client";

import { useState } from "react";

import PendingApprovals from "./PendingApprovals";
import ApprovedUsers from "./ApprovedUsers";

import "@/app/styles/admin-dashboard/Approvals.css";

export default function Approvals(){

  const [activeTab,setActiveTab] = useState("Pending Approvals");

  return(

    <div className="approvals-container">

      <div className="approvals-tabs-container">

  <div
    className={`approvals-tab ${
      activeTab === "Pending Approvals" ? "active" : ""
    }`}
    onClick={() => setActiveTab("Pending Approvals")}
  >
    Pending Approvals
  </div>

  <div
    className={`approvals-tab ${
      activeTab === "Approved Users" ? "active" : ""
    }`}
    onClick={() => setActiveTab("Approved Users")}
  >
    Approved Users
  </div>

</div>

      {activeTab==="Pending Approvals" && <PendingApprovals/>}

      {activeTab==="Approved Users" && <ApprovedUsers/>}

    </div>

  );

}