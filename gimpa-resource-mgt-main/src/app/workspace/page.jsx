"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import app from "@/firebase/config";
import Approvals from "@/app/workspace/admin-dashboard/Approvals";
import Sidebar from "@/app/components/Sidebar";
import Header from "@/app/components/Header";
import CampusResource from "@/app/workspace/resource-management/campus-resource";
import Users from "@/app/workspace/admin-dashboard/Users";

import "@/app/styles/workspace/workspace.css";

export default function WorkspacePage() {

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  const [activeSidebar, setActiveSidebar] = useState("Dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("Campus Resources");

  const resourceTabs = ["Campus Resources", "Bookings"];
  const adminTabs = ["Approvals", "Users"];

  const auth = getAuth(app);
  const firestore = getFirestore(app);


  // Check authentication + approval

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        router.push("/login");
        return;
      }

      const userDoc = await getDoc(doc(firestore, "users", user.uid));

      if (!userDoc.exists()) {
        router.push("/login");
        return;
      }

      const userData = userDoc.data();

      if (!userData.approved) {
        router.push("/awaiting-approval");
        return;
      }

      setUserRole(userData.role);
      setLoading(false);

    });

    return () => unsubscribe();

  }, []);

  if (loading) {
    return <div className="workspace-loading">Loading...</div>;
  }

  return (
    <div>

      <Header />

      <div className="workspace-container">

        <Sidebar
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          activeTab={activeSidebar}
          setActiveTab={(tab) => {
            setActiveSidebar(tab);
            setActiveTab(tab === "Admin Dashboard" ? "Approvals" : "Campus Resources");
          }}
        />

        <div className={`workspace-main ${sidebarCollapsed ? "collapsed" : ""}`}>

         
          {/* RESOURCE MANAGEMENT TABS */}
       
          {activeSidebar === "Resource Management" && (
            <div className="resource-management-tabs-container">
              {resourceTabs.map((tab) => (
                <div
                  key={tab}
                  className={`resource-management-tab ${
                    activeTab === tab ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </div>
              ))}
            </div>
          )}

          {activeSidebar === "Resource Management" && activeTab === "Campus Resources" && (
  <CampusResource userRole={userRole} />
)}

       
          {/* ADMIN DASHBOARD TABS */}
        
          {activeSidebar === "Admin Dashboard" && (
            <div className="resource-management-tabs-container">
              {adminTabs.map((tab) => (
                <div
                  key={tab}
                  className={`resource-management-tab ${
                    activeTab === tab ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </div>
              ))}
            </div>
          )}

          {/* Approvals Panel */}
          {activeSidebar === "Admin Dashboard" && activeTab === "Approvals" && (
            <Approvals />
          )}

          {/* Users Panel */}
          {activeSidebar === "Admin Dashboard" && activeTab === "Users" && (
          <Users />
        )}

        </div>

      </div>

    </div>
  );
}