// Stage 4o Phase 2 — building → {lat, lng} lookup for Cloud Functions.
//
// DUPLICATED from src/app/lib/gimpaBuildingCoordinates.js. The Next.js
// src/ tree can't be imported from the functions runtime (separate
// package, separate module graph), so — like ADMIN_LEVEL_ROLES in
// sendWeeklyReports.js — the table is mirrored here and must be kept in
// sync by hand. If you add/rename a building in the web lib, update this
// copy too.

export const GIMPA_CENTER = { lat: 5.6500, lng: -0.1933 };

export const BUILDING_COORDINATES = {
  "Main Administration Block": { lat: 5.6502, lng: -0.1935 },
  "Engineering Block":         { lat: 5.6498, lng: -0.1928 },
  "Faculty of Business":       { lat: 5.6495, lng: -0.1940 },
  "Conference Centre":         { lat: 5.6508, lng: -0.1932 },
  "Library Block":             { lat: 5.6500, lng: -0.1925 },
  "Computer Centre":           { lat: 5.6505, lng: -0.1942 },
  "Halls of Residence":        { lat: 5.6493, lng: -0.1948 },
  "GIMPA SBS Building":        { lat: 5.6510, lng: -0.1925 },
  "Logistics Block":           { lat: 5.6488, lng: -0.1938 },
  "Maintenance Workshop":      { lat: 5.6488, lng: -0.1925 },
  "IT Storage":                { lat: 5.6505, lng: -0.1940 },
  "AV Storage":                { lat: 5.6502, lng: -0.1928 }
};

// Returns the base coordinates for a known building, or GIMPA_CENTER for
// an unrecognised name (isFallback flags that). No per-asset jitter here
// — a check-in records the building the user picked, and stacking pins at
// the building centre is acceptable for Phase 2.
export function coordsForBuilding(buildingName) {
  const base = BUILDING_COORDINATES[buildingName];
  return {
    lat: base ? base.lat : GIMPA_CENTER.lat,
    lng: base ? base.lng : GIMPA_CENTER.lng,
    isFallback: !base
  };
}
