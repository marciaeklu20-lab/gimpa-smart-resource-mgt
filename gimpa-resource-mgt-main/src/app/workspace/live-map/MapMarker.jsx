"use client";

// Stage 4o Phase 1 — a single resource marker on the Live Map.
//
// Thin wrapper around <Marker> from @react-google-maps/api:
//   - position from buildingCoordsForResource(resource)
//   - colour by condition
//   - hover tooltip = asset code
//   - forwards click to the parent (LiveMapView owns the InfoWindow)

import { Marker } from "@react-google-maps/api";

import { buildingCoordsForResource } from "@/app/lib/gimpaBuildingCoordinates";

// Mirrors the condition enum in src/app/lib/resourceMeta.js.
const CONDITION_COLORS = {
  excellent: "#16a34a",
  good: "#65a30d",
  fair: "#eab308",
  poor: "#f97316",
  out_of_service: "#dc2626"
};

const FALLBACK_COLOR = "#65a30d"; // treat unknown condition as "good"

export default function MapMarker({ resource, onClick }) {
  const pos = buildingCoordsForResource(resource);
  const color = CONDITION_COLORS[resource?.condition] || FALLBACK_COLOR;

  // window.google is guaranteed present — LiveMapView only renders
  // markers once useJsApiLoader reports isLoaded.
  const icon =
    typeof window !== "undefined" && window.google
      ? {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale: 8
        }
      : undefined;

  return (
    <Marker
      position={{ lat: pos.lat, lng: pos.lng }}
      icon={icon}
      title={resource?.assetCode || resource?.id || ""}
      onClick={() => onClick?.(resource)}
    />
  );
}
