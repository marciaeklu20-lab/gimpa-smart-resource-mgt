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
import BookingRequests from "@/app/workspace/resource-management/BookingRequests";
import Users from "@/app/workspace/admin-dashboard/Users";
import Analytics from "@/app/workspace/analytics/Analytics";
import Dashboard from "@/app/workspace/dashboard/Dashboard";

import "@/app/styles/workspace/workspace.css";

export default function WorkspacePage() {

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [activeSidebar, setActiveSidebar] = useState("Dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("Campus Resources");

  // Cross-tab "navigation intent" for the Bookings view: filled in by
  // Dashboard stat cards and RecentActivity row clicks, consumed by
  // BookingTable as initialFilter / initialExpandedId. Auto-cleared
  // below when the user navigates away — a stale filter waiting on the
  // Bookings tab from a previous click would be confusing during a live
  // demo.
  const [bookingsView, setBookingsView] = useState({
    filter: null,
    expandedId: null
  });

  // Single cross-tab navigation helper. Dashboard / RecentActivity call
  // this instead of touching the individual setters directly. When `tab`
  // is omitted, picks the natural landing tab for that sidebar — mirrors
  // the Sidebar onClick behaviour so callers don't need to know it.
  const navigate = ({ sidebar, tab, filter, expandedId } = {}) => {
    if (sidebar) setActiveSidebar(sidebar);
    if (tab) {
      setActiveTab(tab);
    } else if (sidebar === "Admin Dashboard") {
      setActiveTab("Approvals");
    } else if (sidebar === "Resource Management") {
      setActiveTab("Campus Resources");
    }
    // Always replace bookingsView with a fresh object reference so the
    // BookingTable effects (which depend on referential identity) fire
    // even when the same filter is being applied again.
    setBookingsView({
      filter: filter ?? null,
      expandedId: expandedId ?? null
    });
  };

  // Auto-clear bookingsView whenever the user navigates away from
  // Resource Management → Bookings — see the "navigation intent"
  // comment above.
  useEffect(() => {
    if (activeSidebar !== "Resource Management" || activeTab !== "Bookings") {
      setBookingsView({ filter: null, expandedId: null });
    }
  }, [activeSidebar, activeTab]);

  const resourceTabs = ["Campus Resources", "Bookings"];
  const adminTabs = ["Approvals", "Users"];

  // Mirrors adminRoles in Sidebar.jsx — the sidebar already hides the
  // Admin Dashboard tab for non-admins; Analytics uses the same gate so
  // a non-admin who somehow lands on the tab sees a clear message instead
  // of a Firestore permission error.
  const adminRoles = ["super_admin", "Secretariat Admin", "IT Officer"];

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
      setCurrentUser({ uid: user.uid, ...userData });
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

          {/* DASHBOARD — landing surface when sidebar = Dashboard */}
          {activeSidebar === "Dashboard" && (
            <Dashboard currentUser={currentUser} navigate={navigate} />
          )}

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

          {activeSidebar === "Resource Management" && activeTab === "Bookings" && (
            <BookingRequests
              initialFilter={bookingsView.filter}
              initialExpandedId={bookingsView.expandedId}
            />
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

          {/* ANALYTICS */}
          {activeSidebar === "Analytics" && (
            adminRoles.includes(userRole)
              ? <Analytics />
              : <div className="workspace-loading">Analytics is admin-only.</div>
          )}

        </div>

      </div>

    </div>
  );
}