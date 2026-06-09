// Single source of truth for role-list constants.
//
// Before this file existed, Sidebar.jsx / subscribeBookings.js /
// Dashboard.jsx / firestore.rules each kept their own copy of the
// admin lists. They drifted: Sidebar.jsx pending-user notifications
// fired for Administrative Officer / Higher Level Management, but
// the Admin Dashboard sidebar item was hidden from them, so the
// notification was unactionable. Centralizing fixes that.
//
// Keep firestore.rules in sync with these lists by hand (rules can't
// import JS).

// Roles that operate the platform: see Admin Dashboard, act on
// pending users, manage resources, etc.
export const PLATFORM_ADMINS = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer"
];

// Roles that approve bookings org-wide but do NOT administer the
// platform. They see every booking but don't see the pending-user
// queue or admin tabs.
export const GLOBAL_APPROVERS = [
  "Administrative Officer",
  "Higher Level Management"
];

// Stage 4e.7: roles that own ("manage") a slice of the resource
// catalogue, partitioned by category. The mapping itself lives in
// categoryResponsibility.js — keep that file in sync with this list.
// These roles can add/edit resources in THEIR categories only and
// approve bookings on those resources.
export const RESOURCE_MANAGERS = [
  "Facility/Estate Officer",
  "IT Officer",
  "Logistics Officer",
  "Stores/Inventory Officer"
];

// Anyone who sees every booking regardless of visibleToRoles /
// visibleToDepartment routing. Used by subscribeBookings.js and the
// Dashboard quick-stats listeners.
export const ALL_BOOKING_ADMINS = [
  ...PLATFORM_ADMINS,
  ...GLOBAL_APPROVERS
];

// Maintenance department heads — assign faults, oversee all maintenance
// activity, and can transition any fault's workflow without being the
// assignee. Stage 4e.5+.
//
// Stage 6: super_admin removed — operationally separated from the
// maintenance domain at the UI level. It retains a DB-level override
// via isAdmin() in firestore.rules (incident recovery), and fault
// oversight reads via the explicit compensation in subscribeFaults.js.
export const MAINTENANCE_ADMINS = [
  "Maintenance Admin"
];

// Roles that see every fault report. Stage 4c+ uses this; declared
// here so the role list lives in one place. Stage 4e.5 adds
// Maintenance Admin to the domain — they see all faults too.
//
// Stage 6: super_admin removed (operational separation). Its fault
// oversight is preserved by an explicit "|| super_admin" compensation
// in subscribeFaults.js, NOT by membership here.
export const MAINTENANCE_ROLES = [
  "Maintenance Admin",
  "Maintenance Staff"
];

// Stage 4l: union of admin-level roles permitted to access the Reports
// surface (manual trigger + recipient list for weekly emails). Excludes
// Maintenance Staff (operational, not admin) and regular users.
//
// MUST stay in sync with the hardcoded ADMIN_LEVEL_ROLES set in
// functions/src/sendWeeklyReports.js (Cloud Functions can't import from
// the src/ tree).
export const ADMIN_LEVEL_ROLES = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management",
  "Facility/Estate Officer",
  "Logistics Officer",
  "Stores/Inventory Officer",
  "Maintenance Admin"
];
