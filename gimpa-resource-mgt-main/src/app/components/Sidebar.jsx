"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import app from "@/firebase/config";

// Admin-level roles that should see the pending-approvals badge.
// Mirrors fetchBookings.js ADMIN_ROLES / firestore.rules isAdmin() ∪
// isGlobalApprover().
const ADMIN_ROLES = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management"
];

import { MdOutlineDashboard } from "react-icons/md";
import { BsMenuButtonWide, BsMenuButtonWideFill, BsChatLeftDots } from "react-icons/bs";
import { FaRobot, FaTools } from "react-icons/fa";
import { GrResources } from "react-icons/gr";
import { RiAdminLine } from "react-icons/ri";

import "@/app/styles/components/sidebar.css";

export default function Sidebar({ collapsed, setCollapsed, activeTab, setActiveTab }) {

  const [role, setRole] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  useEffect(() => {
    const fetchUserRole = async () => {

      const user = auth.currentUser;

      if (!user) return;

      const userDoc = await getDoc(doc(firestore, "users", user.uid));

      if (userDoc.exists()) {
        setRole(userDoc.data().role);
      }

    };

    fetchUserRole();

  }, []);

  // Live count of users awaiting admin approval. Subscribed only for
  // admin-level viewers; torn down on unmount or role change.
  useEffect(() => {

    if (!role || !ADMIN_ROLES.includes(role)) {
      setPendingCount(0);
      return;
    }

    const q = query(
      collection(firestore, "users"),
      where("needsApproval", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.size);
    });

    return unsubscribe;

  }, [role]);

  // roles that should see admin dashboard
  const adminRoles = ["super_admin", "Secretariat Admin", "IT Officer"];

  const features = [
    { name: "Dashboard", icon: <MdOutlineDashboard size={20} /> },
    { name: "Resource Management", icon: <GrResources size={20} /> },
    { name: "Chat", icon: <BsChatLeftDots size={20} /> },
    { name: "Maintenance", icon: <FaTools size={20} /> },
    { name: "Analytics", icon: <BsMenuButtonWide size={20} /> },
    { name: "AI Assistant", icon: <FaRobot size={20} /> },

    // Admin Dashboard visible only to admin roles
    ...(adminRoles.includes(role)
      ? [{ name: "Admin Dashboard", icon: <RiAdminLine size={20} /> }]
      : []),
  ];

  return (
    <aside className={`sidebar-container ${collapsed ? "collapsed" : ""}`}>

      {/* Toggle button */}
      <div
        className="sidebar-toggle-btn"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed
          ? <BsMenuButtonWide size={24} />
          : <BsMenuButtonWideFill size={24} />}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">

        {features.map((feature) => (

          <div
            key={feature.name}
            className={`sidebar-item ${activeTab === feature.name ? "active" : ""}`}
            onClick={() => setActiveTab(feature.name)}
          >

            <span className="sidebar-icon">{feature.icon}</span>

            {!collapsed && (
              <span className="sidebar-text">{feature.name}</span>
            )}

            {feature.name === "Admin Dashboard" && pendingCount > 0 && (
              <span className="sidebar-badge">{pendingCount}</span>
            )}

          </div>

        ))}

      </nav>

    </aside>
  );
}