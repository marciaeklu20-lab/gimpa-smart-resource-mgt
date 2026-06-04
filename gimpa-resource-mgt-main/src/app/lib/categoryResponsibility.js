// Stage 4e.7: single source of truth for which role owns which
// resource category. The forward map is used to derive the
// responsibleRole field on a resource at creation time; the reverse
// map is used by the "My Responsibility" view + AddResourceForm
// category filter.
//
// Keep this file in sync with:
//   - RESOURCE_MANAGERS in src/app/lib/roles.js (the role list)
//   - firestore.rules myCategory() / canManageCategory() helpers
//     (rules can't import JS so the mapping is duplicated by hand)

export const CATEGORY_RESPONSIBILITY = {
  "Facilities":                         "Facility/Estate Officer",
  "Electronics & Electrical Equipment": "IT Officer",
  "Vehicles & Transport":               "Logistics Officer",
  "Furniture":                          "Facility/Estate Officer",
  "Office Supplies & Stationery":       "Stores/Inventory Officer",
  "Tools & Maintenance Equipment":      "Stores/Inventory Officer",
  // "Other" is the catch-all — Stores own it by default. If a future
  // role takes over generic items, change this mapping in one place.
  "Other":                              "Stores/Inventory Officer"
};

export const ROLE_TO_CATEGORIES = {
  "Facility/Estate Officer": ["Facilities", "Furniture"],
  "IT Officer":              ["Electronics & Electrical Equipment"],
  "Logistics Officer":       ["Vehicles & Transport"],
  "Stores/Inventory Officer": [
    "Office Supplies & Stationery",
    "Tools & Maintenance Equipment",
    "Other"
  ]
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_RESPONSIBILITY);

export const responsibleRoleForCategory = (category) =>
  CATEGORY_RESPONSIBILITY[category] || null;

// Returns the list of categories the given role manages. Returns []
// for any role that isn't a resource manager — callers can use the
// empty array as a "no access" sentinel.
export const categoriesForRole = (role) =>
  ROLE_TO_CATEGORIES[role] || [];

export const isResourceManager = (role) =>
  !!role && Object.prototype.hasOwnProperty.call(ROLE_TO_CATEGORIES, role);
