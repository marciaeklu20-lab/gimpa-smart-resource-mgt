"use client";

// Stage 4j — Analytics is now a thin role-routing wrapper, matching
// Dashboard.jsx's pattern. Each role lands on a tailored reporting
// surface in role-views/:
//
//   Platform admins + global approvers → AnalyticsPlatform
//   Resource managers                   → AnalyticsResourceManager
//   Lecturer / Course Rep / TA / student → AnalyticsBooker
//   Maintenance staff / admin           → AnalyticsMaintenance
//
// Roles outside these buckets see a small "not configured" note rather
// than a blank surface. The workspace-level admin-only gate that wrapped
// the previous Analytics.jsx is removed in workspace/page.jsx — gating
// now happens here so the right view loads for each role.

import {
  PLATFORM_ADMINS,
  RESOURCE_MANAGERS,
  MAINTENANCE_ROLES,
  GLOBAL_APPROVERS
} from "@/app/lib/roles";

import AnalyticsPlatform        from "./role-views/AnalyticsPlatform";
import AnalyticsResourceManager from "./role-views/AnalyticsResourceManager";
import AnalyticsBooker          from "./role-views/AnalyticsBooker";
import AnalyticsMaintenance     from "./role-views/AnalyticsMaintenance";

import "@/app/styles/analytics/Analytics.css";

// Mirrors BOOKER_ROLES in Dashboard.jsx. Students' actual role value is
// "student" (lowercase, derived from email domain at signup), not
// "General Student" (which is the studentType label).
const BOOKER_ROLES = [
  "Lecturer",
  "Teaching Assistant",
  "Course Rep",
  "student"
];

export default function Analytics({ currentUser, navigate }) {

  const role = currentUser?.role;

  if (!role) {
    return (
      <div className="analytics-container">
        <div className="analytics-loading">Loading analytics…</div>
      </div>
    );
  }

  if (PLATFORM_ADMINS.includes(role) || GLOBAL_APPROVERS.includes(role)) {
    return <AnalyticsPlatform currentUser={currentUser} navigate={navigate} />;
  }

  if (RESOURCE_MANAGERS.includes(role)) {
    return <AnalyticsResourceManager currentUser={currentUser} navigate={navigate} />;
  }

  if (MAINTENANCE_ROLES.includes(role)) {
    return <AnalyticsMaintenance currentUser={currentUser} navigate={navigate} />;
  }

  if (BOOKER_ROLES.includes(role)) {
    return <AnalyticsBooker currentUser={currentUser} navigate={navigate} />;
  }

  return (
    <div className="analytics-container">
      <div className="analytics-empty">
        Analytics not configured for your role yet — use the sidebar to
        navigate to the modules available to you.
      </div>
    </div>
  );
}
