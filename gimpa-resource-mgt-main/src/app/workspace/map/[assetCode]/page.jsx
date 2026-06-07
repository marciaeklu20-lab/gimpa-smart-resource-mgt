"use client";

// Stage 4o Phase 1 (redesign) — per-asset map route.
//
// Full-page, asset-centric view reached from the AssetDetailPanel
// "View on Map" button. Sits outside the state-driven /workspace tab
// shell as a real Next.js dynamic route, so the URL carries the asset
// code and the view is linkable / shareable.

import { useParams } from "next/navigation";

import AssetFocusedMap from "./AssetFocusedMap";

export default function Page() {
  const params = useParams();
  const assetCode = params?.assetCode
    ? decodeURIComponent(params.assetCode)
    : null;
  return <AssetFocusedMap assetCode={assetCode} />;
}
