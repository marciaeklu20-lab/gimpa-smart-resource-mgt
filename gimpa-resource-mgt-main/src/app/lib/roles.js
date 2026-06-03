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

// Anyone who sees every booking regardless of visibleToRoles /
// visibleToDepartment routing. Used by subscribeBookings.js and the
// Dashboard quick-stats listeners.
export const ALL_BOOKING_ADMINS = [
  ...PLATFORM_ADMINS,
  ...GLOBAL_APPROVERS
];

// Roles that see every fault report. Stage 4c+ will use this; declared
// here so the role list lives in one place.
export const MAINTENANCE_ROLES = [
  "super_admin",
  "Maintenance Staff"
];
