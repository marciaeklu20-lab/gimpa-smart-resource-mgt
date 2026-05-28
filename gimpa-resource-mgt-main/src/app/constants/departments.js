// Single source of truth for GIMPA academic departments.
// Imported by signup (RoleSelector), the admin user directory (Users),
// and any future booking / department filter UI.

export const departments = [
  "School Of Technology And Social Sciences",
  "GIMPA Law School",
  "Business School",
  "School Of Public Service And Governance",
  "School Of Research And Graduate Studies"
];

// Sentinel for users whose role does NOT belong to an academic department
// (e.g. central administrators, support staff). Stored as `null` on the
// user document; only used as a label in admin filter UIs.
export const CENTRAL_ADMIN_LABEL = "Central Administration";
