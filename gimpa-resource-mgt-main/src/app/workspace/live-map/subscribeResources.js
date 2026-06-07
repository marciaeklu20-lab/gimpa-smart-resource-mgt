"use client";

// Stage 4o Phase 1 — real-time subscription to all resources for the
// Live Map. Mirrors the existing subscribeBookings / subscribeFaults
// pattern (db is derived from the shared @/firebase/config app, not the
// non-existent @/app/lib/firebase). Listens to ALL resources (no filter)
// — filters are applied client-side in the map UI.
//
// Returns the onSnapshot unsubscribe function so the caller can use it
// directly as a useEffect cleanup.

import { getFirestore, collection, onSnapshot } from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export function subscribeResources(onUpdate, onError) {
  const col = collection(db, "resources");
  return onSnapshot(
    col,
    (snap) => {
      const resources = [];
      snap.forEach((doc) => {
        const data = doc.data();
        // assetCode is the doc id by convention, but keep a fallback so
        // the per-asset jitter in buildingCoordsForResource is stable.
        resources.push({ id: doc.id, ...data, assetCode: data.assetCode || doc.id });
      });
      onUpdate(resources);
    },
    (err) => {
      console.error("[subscribeResources]", err);
      onError?.(err);
    }
  );
}
