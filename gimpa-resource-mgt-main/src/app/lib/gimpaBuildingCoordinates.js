// Stage 4o Phase 1 — building → {lat, lng} lookup for the Live Map.
//
// Anchored at GIMPA Greenhill (Achimota). Coordinates are synthesized to
// spread realistic-looking pins within the campus footprint; refine with
// actual surveyed coordinates when available (Future Work).
//
// NOTE: a resource whose location.building is not one of the keys below
// falls back to GIMPA_CENTER (isFallback: true). That is intentional for
// Phase 1 — see the Stage 4o scope guards. Expanding this map to cover
// every building name in the data is Future Work.

// GIMPA Greenhill (Achimota) — real-world campus centre
export const GIMPA_CENTER = { lat: 5.6500, lng: -0.1933 };
export const DEFAULT_ZOOM = 17;

// Map of building name (matches resources.location.building) →
// approximate lat/lng. Coordinates synthesized to spread realistic-
// looking pins within the GIMPA Greenhill footprint; refine with
// actual surveyed coordinates when available (Future Work).
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

// Tiny jitter so resources in the same building don't stack
// exactly on top of each other. Deterministic per assetCode so
// pins don't dance between renders.
export function buildingCoordsForResource(resource) {
  const buildingName = resource?.location?.building;
  const base = BUILDING_COORDINATES[buildingName] || GIMPA_CENTER;
  const seed = (resource?.assetCode || "").split("").reduce(
    (acc, ch) => acc + ch.charCodeAt(0), 0
  );
  const jitterLat = ((seed % 17) - 8) * 0.000015;
  const jitterLng = ((seed % 23) - 11) * 0.000015;
  return {
    lat: base.lat + jitterLat,
    lng: base.lng + jitterLng,
    buildingName: buildingName || "Unknown building",
    isFallback: !BUILDING_COORDINATES[buildingName]
  };
}
