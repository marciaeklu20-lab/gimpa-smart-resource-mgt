"use client";

// Stage 4o Phase 1 — a single resource marker on the Live Map.
//
// Thin wrapper around <Marker> from @react-google-maps/api:
//   - position from buildingCoordsForResource(resource)
//   - colour by condition
//   - hover tooltip = asset code
//   - forwards click to the parent (LiveMapView owns the InfoWindow)
//   - `focused` (the per-asset route's subject) renders 1.5× larger and
//     animates to draw the eye. NOTE: a <Marker> icon is drawn on the
//     map canvas, not a DOM node, so a CSS @keyframes pulse can't attach
//     to it — the attention cue is Google's built-in BOUNCE animation +
//     the larger scale. (The .focused-marker CSS still ships for any
//     future DOM-overlay marker.)

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

const BASE_SCALE = 8;
const FOCUSED_SCALE = 12; // 1.5× the base

export default function MapMarker({ resource, focused = false, onClick }) {
  const pos = buildingCoordsForResource(resource);
  const color = CONDITION_COLORS[resource?.condition] || FALLBACK_COLOR;

  // window.google is guaranteed present — LiveMapView only renders
  // markers once useJsApiLoader reports isLoaded.
  const hasGoogle = typeof window !== "undefined" && !!window.google;

  const icon = hasGoogle
    ? {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: focused ? 2.5 : 1.5,
        scale: focused ? FOCUSED_SCALE : BASE_SCALE
      }
    : undefined;

  // BOUNCE is the only built-in animation that reads as "look here" for a
  // canvas marker; reserved for the focused asset so the map isn't noisy.
  const animation =
    focused && hasGoogle ? window.google.maps.Animation.BOUNCE : undefined;

  return (
    <Marker
      position={{ lat: pos.lat, lng: pos.lng }}
      icon={icon}
      animation={animation}
      zIndex={focused ? 1000 : undefined}
      title={resource?.assetCode || resource?.id || ""}
      onClick={() => onClick?.(resource)}
    />
  );
}
