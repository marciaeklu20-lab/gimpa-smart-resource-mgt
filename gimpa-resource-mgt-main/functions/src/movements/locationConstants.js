// Stage 4o Phase 3 — shared building constants for the event-driven
// movement listeners.
//
// These name buildings that MUST exist as keys in buildingCoordinates.js
// (BUILDING_COORDINATES). coordsForBuilding falls back to GIMPA_CENTER for
// an unknown name, so a typo here would silently stack pins at the campus
// centre — keep the spellings byte-identical to the coordinate table.

export const MAINTENANCE_BUILDING = "Maintenance Workshop";
export const ARCHIVE_BUILDING     = "Logistics Block";

// Which lifecycleStatus values trigger an automatic move, and to where.
// Only terminal/archival states map to a building:
//   - retired / disposed → the archive (co-located with logistics for the
//     GIMPA Greenhill demo; a dedicated archive coord is Future Work)
//   - lost → null: we can't physically locate a lost asset, so no move
//   - active / in_maintenance are intentionally absent — "active" is the
//     steady state and "in_maintenance" is driven by the fault path
//     (onFaultLogged), not by a lifecycleStatus edit.
export const LIFECYCLE_TO_BUILDING = {
  retired:  ARCHIVE_BUILDING,
  disposed: ARCHIVE_BUILDING,
  lost:     null
};
