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

import RecentActivity from "@/app/workspace/analytics/RecentActivity";

import "@/app/styles/workspace/dashboard.css";

const db = getFirestore(app);

// Mirrors Sidebar.jsx ADMIN_ROLES / firestore.rules isAdmin() ∪
// isGlobalApprover() — kept in sync manually.
const ADMIN_ROLES = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management"
];

const todayISODate = () => {
  // ISO YYYY-MM-DD for today, in the user's local timezone. Used to
  // bucket booking startDates (also stored as ISO strings) by day.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Dashboard({ currentUser, navigate }) {

  const [pendingCount, setPendingCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  const isAdmin = !!(currentUser && ADMIN_ROLES.includes(currentUser.role));

  // Quick-stats listeners — admin-only because non-admins can't read
  // the full bookings collection per Firestore rules.
  useEffect(() => {

    if (!isAdmin) {
      setPendingCount(0);
      setTodayCount(0);
      return;
    }

    const unsubs = [];

    unsubs.push(onSnapshot(
      query(collection(db, "bookings"), where("status", "==", "pending")),
      (snap) => setPendingCount(snap.size)
    ));

    unsubs.push(onSnapshot(
      collection(db, "bookings"),
      (snap) => {
        const today = todayISODate();
        const count = snap.docs.filter((d) => {
          const start = d.data().startDate;
          return typeof start === "string" && start.startsWith(today);
        }).length;
        setTodayCount(count);
      }
    ));

    return () => unsubs.forEach((u) => u());

  }, [isAdmin]);

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  return (

    <div className="dashboard-container">

      <div className="dashboard-header">
        <h1 className="dashboard-greeting">Welcome back, {firstName}</h1>
        <p className="dashboard-subtitle">
          Here&apos;s what&apos;s happening across GIMPA today.
        </p>
      </div>

      {isAdmin && (
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
      )}

      {isAdmin ? (

        <div className="dashboard-activity-wrapper">
          <RecentActivity navigate={navigate} />
        </div>

      ) : (

        <div className="dashboard-non-admin-note">
          Use the sidebar to find resources or manage your bookings.
        </div>

      )}

    </div>

  );

}
