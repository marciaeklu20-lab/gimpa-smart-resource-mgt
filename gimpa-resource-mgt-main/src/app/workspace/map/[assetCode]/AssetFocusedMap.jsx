"use client";

// Stage 4o Phase 1 (redesign) — asset-focused map wrapper.
//
// Fetches the one resource named by the route param, then renders the
// shared LiveMapView centred + pre-opened on that asset. Owns the
// loading / not-found / error chrome and the sticky header with a Back
// button. router.back() returns the user to wherever they came from
// (normally the AssetDetailPanel inside /workspace) — the App Router
// client cache restores that view without a remount when it's warm.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { getFirestore, doc, getDoc } from "firebase/firestore";
import app from "@/firebase/config";

import LiveMapView from "@/app/workspace/live-map/LiveMapView";

import "@/app/styles/live-map/LiveMap.css";

const db = getFirestore(app);

export default function AssetFocusedMap({ assetCode }) {
  const router = useRouter();
  const [asset, setAsset] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | not-found | error

  useEffect(() => {
    if (!assetCode) {
      setStatus("not-found");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "resources", assetCode));
        if (cancelled) return;
        if (!snap.exists()) {
          setStatus("not-found");
          return;
        }
        // assetCode is the doc id by convention; keep a fallback so the
        // per-asset jitter in buildingCoordsForResource stays stable.
        const data = snap.data();
        setAsset({ id: snap.id, ...data, assetCode: data.assetCode || snap.id });
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          console.error("[AssetFocusedMap] failed to load resource:", e);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetCode]);

  if (status === "loading") {
    return <div className="map-page-loading">Loading map…</div>;
  }

  if (status === "not-found") {
    return <NotFoundView code={assetCode} onBack={() => router.back()} />;
  }

  if (status === "error") {
    return <ErrorView onBack={() => router.back()} />;
  }

  return (
    <div className="asset-focused-map-page">
      <header className="map-page-header">
        <button
          type="button"
          onClick={() => router.back()}
          className="map-back-btn"
        >
          ← Back
        </button>
        <div className="map-page-title">
          <h2>{asset.resourceName || asset.name || "Unnamed resource"}</h2>
          <span className="map-page-code">{asset.assetCode}</span>
        </div>
      </header>

      <LiveMapView focusedAsset={asset} />
    </div>
  );
}

function NotFoundView({ code, onBack }) {
  return (
    <div className="map-page-state">
      <div className="live-map-error">
        <h3>Asset not found</h3>
        <p>
          No resource exists for asset code <code>{code || "—"}</code>. It may
          have been removed, or the link is incorrect.
        </p>
      </div>
      <button type="button" className="map-back-btn" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}

function ErrorView({ onBack }) {
  return (
    <div className="map-page-state">
      <div className="live-map-error">
        <h3>Couldn’t load this asset</h3>
        <p>
          Something went wrong fetching the resource. Check your connection and
          try again.
        </p>
      </div>
      <button type="button" className="map-back-btn" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}
