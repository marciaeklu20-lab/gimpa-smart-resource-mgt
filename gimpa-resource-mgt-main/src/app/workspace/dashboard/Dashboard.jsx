"use client";

// Stage 4g: thin role-routing wrapper. The previous all-in-one
// Dashboard.jsx (admin quick-stats + RecentActivity, non-admin "use
// the sidebar" note) is gone — each role now lands on a tailored
// surface in role-views/. Keep this wrapper minimal: pick a view,
// pass through props, fall back to a clear message for any role
// that doesn't have a configured view yet.

import {
  PLATFORM_ADMINS,
  RESOURCE_MANAGERS,
  MAINTENANCE_ROLES
} from "@/app/lib/roles";

import PlatformDashboard from "./role-views/PlatformDashboard";
import ResourceManagerDashboard from "./role-views/ResourceManagerDashboard";
import MaintenanceDashboardEmbed from "./role-views/MaintenanceDashboardEmbed";
import BookerDashboard from "./role-views/BookerDashboard";

import "@/app/styles/workspace/dashboard.css";

// Roles that book resources for themselves (faculty + students). Kept
// here rather than in roles.js because the "booker" tier is a UI
// concept — booking permission itself is gated by cannotBookRoles in
// permissions.js. If those lists diverge later, we'll need to
// reconcile.
const BOOKER_ROLES = [
  "Lecturer",
  "Teaching Assistant",
  "Course Rep",
  "student"
];

export default function Dashboard({ currentUser, navigate }) {

  const role = currentUser?.role;

  if (!role) {
    // Shouldn't normally happen — workspace/page.jsx gates on a loaded
    // currentUser before rendering Dashboard — but the explicit fallback
    // keeps this component robust in isolation (e.g., Storybook later).
    return (
      <div className="dashboard-container">
        <div className="dashboard-non-admin-note">
          Loading your dashboard…
        </div>
      </div>
    );
  }

  if (PLATFORM_ADMINS.includes(role)) {
    return <PlatformDashboard currentUser={currentUser} navigate={navigate} />;
  }

  if (RESOURCE_MANAGERS.includes(role)) {
    return <ResourceManagerDashboard currentUser={currentUser} navigate={navigate} />;
  }

  if (MAINTENANCE_ROLES.includes(role)) {
    return <MaintenanceDashboardEmbed currentUser={currentUser} navigate={navigate} />;
  }

  if (BOOKER_ROLES.includes(role)) {
    return <BookerDashboard currentUser={currentUser} navigate={navigate} />;
  }

  // Roles that don't fit any view (Receptionist, Administrative Officer,
  // Higher Level Management, etc.) — show a clear "not configured"
  // message rather than a blank screen so we know to add a view later.
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-greeting">
          Welcome, {currentUser?.fullName?.split(" ")[0] || "there"}
        </h1>
      </div>
      <div className="dashboard-non-admin-note">
        Dashboard not configured for your role yet — use the sidebar to
        navigate to the modules available to you.
      </div>
    </div>
  );
}
