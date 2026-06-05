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
import Maintenance from "@/app/workspace/maintenance/Maintenance";
import SupplyRequestsList from "@/app/workspace/maintenance/supplyRequest/SupplyRequestsList";

import { PLATFORM_ADMINS } from "@/app/lib/roles";

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

  // Stage 4d: deep-link from FaultDetailPanel "open asset" — when set,
  // CampusResource picks this up via initialAssetId and selects the
  // matching row in its master table. Same auto-clear pattern as
  // bookingsView so a stale assetId doesn't follow the user around.
  const [resourceView, setResourceView] = useState({ assetId: null });

  // Stage 4f: deep-link from AssetDetailPanel "Resolved from fault: X"
  // entry — when set, Maintenance picks this up via initialFaultId
  // and selects the matching row in its master table. Mirrors the
  // resourceView pattern.
  const [maintenanceView, setMaintenanceView] = useState({ faultId: null });

  // Single cross-tab navigation helper. Dashboard / RecentActivity call
  // this instead of touching the individual setters directly. When `tab`
  // is omitted, picks the natural landing tab for that sidebar — mirrors
  // the Sidebar onClick behaviour so callers don't need to know it.
  const navigate = ({ sidebar, tab, filter, expandedId, assetId, faultId } = {}) => {
    // Stage 4f: faultId implies Maintenance → Faults, regardless of
    // what sidebar the caller passed. Lets condition-history entries
    // navigate without each call site having to spell out the route.
    const effectiveSidebar = faultId ? "Maintenance" : sidebar;
    const effectiveTab = faultId
      ? "Faults"
      : tab
        ? tab
        : sidebar === "Admin Dashboard"
          ? "Approvals"
          : sidebar === "Resource Management"
            ? "Campus Resources"
            : null;

    if (effectiveSidebar) setActiveSidebar(effectiveSidebar);
    if (effectiveTab) setActiveTab(effectiveTab);

    // Always replace bookingsView with a fresh object reference so the
    // BookingTable effects (which depend on referential identity) fire
    // even when the same filter is being applied again.
    setBookingsView({
      filter: filter ?? null,
      expandedId: expandedId ?? null
    });
    setResourceView({ assetId: assetId ?? null });
    setMaintenanceView({ faultId: faultId ?? null });
  };

  // Auto-clear bookingsView whenever the user navigates away from
  // Resource Management → Bookings — see the "navigation intent"
  // comment above.
  useEffect(() => {
    if (activeSidebar !== "Resource Management" || activeTab !== "Bookings") {
      setBookingsView({ filter: null, expandedId: null });
    }
  }, [activeSidebar, activeTab]);

  // Auto-clear resourceView when leaving Resource Management → Campus
  // Resources, so a stale "navigate to asset X" intent doesn't follow
  // the user back into the tab on a fresh visit.
  useEffect(() => {
    if (
      activeSidebar !== "Resource Management"
      || activeTab !== "Campus Resources"
    ) {
      setResourceView({ assetId: null });
    }
  }, [activeSidebar, activeTab]);

  // Stage 4f: same auto-clear for the Maintenance faultId intent.
  useEffect(() => {
    if (activeSidebar !== "Maintenance") {
      setMaintenanceView({ faultId: null });
    }
  }, [activeSidebar]);

  // Stage 4e.8: Stores Officer + super_admin get a "Supply Requests"
  // tab inside Resource Management as their primary surface. Other
  // resource managers (Facility, IT, Logistics) and the platform-
  // admin tier without stores duties don't need it here — they can
  // still view supply requests via the Maintenance module's sub-tab.
  const STORES_TAB_ROLES = ["Stores/Inventory Officer", "super_admin"];
  const resourceTabs = STORES_TAB_ROLES.includes(userRole)
    ? ["Campus Resources", "Bookings", "Supply Requests"]
    : ["Campus Resources", "Bookings"];
  const adminTabs = ["Approvals", "Users"];

  // Mirrors Sidebar.jsx — the sidebar already hides the Admin Dashboard
  // tab for non-admins; Analytics uses the same gate so a non-admin who
  // somehow lands on the tab sees a clear message instead of a Firestore
  // permission error.

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

          {/* MAINTENANCE — Stage 4c scaffold; sub-tabs owned by the
              Maintenance component itself, not the page's activeTab.
              Stage 4f: initialFaultId deep-links from AssetDetailPanel
              "Resolved from fault: X" entries. */}
          {activeSidebar === "Maintenance" && (
            <Maintenance
              currentUser={currentUser}
              navigate={navigate}
              initialFaultId={maintenanceView.faultId}
            />
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
            <CampusResource
              userRole={userRole}
              initialAssetId={resourceView.assetId}
              navigate={navigate}
            />
          )}

          {activeSidebar === "Resource Management" && activeTab === "Bookings" && (
            <BookingRequests
              initialFilter={bookingsView.filter}
              initialExpandedId={bookingsView.expandedId}
            />
          )}

          {/* Stage 4e.8: Stores-side surface on the supplyRequests queue.
              Same component the Maintenance module uses — defaults switch
              by role (Stores lands on Pending, Maintenance on My
              Requests). */}
          {activeSidebar === "Resource Management" && activeTab === "Supply Requests" && (
            <SupplyRequestsList navigate={navigate} />
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
            PLATFORM_ADMINS.includes(userRole)
              ? <Analytics />
              : <div className="workspace-loading">Analytics is admin-only.</div>
          )}

        </div>

      </div>

    </div>
  );
}