// Stage 4o Phase 3 — single resources/{assetCode} update trigger handling
// BOTH movement-causing edits:
//
//   A. lifecycleStatus change → archive move (retired/disposed → Logistics
//      Block). "lost" maps to null (can't locate) → no move.
//   B. home location change   → transfer move. The transferAsset service is
//      CLIENT-side (web SDK) and can't call this Admin-SDK writer directly,
//      so we observe the resulting resource.location write here instead.
//
// One trigger, not two, because two onDocumentUpdated listeners on the same
// document would both fire on every write and each need its own copy of the
// infinite-loop guard. Lifecycle takes priority over a coincident location
// change (an archive move shouldn't also be logged as a transfer).
//
// INFINITE-LOOP GUARD: our own writeMovement only ever touches
// currentLocation. If that's the sole changed key, this is our echo — bail
// before doing anything.

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { writeMovement } from "./writeMovement.js";
import { coordsForBuilding } from "./buildingCoordinates.js";
import { LIFECYCLE_TO_BUILDING } from "./locationConstants.js";

if (!getApps().length) {
  initializeApp();
}

export const onResourceDocChanged = onDocumentUpdated(
  {
    document: "resources/{assetCode}",
    region: "europe-west1"
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Echo guard — currentLocation-only change is our own writeMovement.
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changedKeys = [...allKeys].filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])
    );
    if (changedKeys.length === 1 && changedKeys[0] === "currentLocation") {
      return;
    }

    const db = getFirestore();
    const assetCode = event.params.assetCode;

    // ── BRANCH A: lifecycleStatus changed and maps to a building ──
    if (before.lifecycleStatus !== after.lifecycleStatus) {
      const target = LIFECYCLE_TO_BUILDING[after.lifecycleStatus];
      if (target) {
        const coords = coordsForBuilding(target);
        await writeMovement({
          db,
          resourceId: assetCode,
          resource: { id: assetCode, ...after },
          toLocation: {
            campus: after.location?.campus || "Main Campus",
            building: target,
            lat: coords.lat,
            lng: coords.lng
          },
          source: `lifecycle:${after.lifecycleStatus}`,
          triggeredBy: after.updatedBy || "system",
          triggeredByRole: "system-lifecycle-listener",
          note: `Automatic move on lifecycle change: ${before.lifecycleStatus} → ${after.lifecycleStatus}`,
          skipIfSameLocation: true
        });
        return; // archival handled — don't also log it as a transfer
      }
    }

    // ── BRANCH B: home location changed (client-side transferAsset) ──
    const homeChanged =
      before.location?.building !== after.location?.building ||
      before.location?.campus !== after.location?.campus;
    if (homeChanged && after.location?.building) {
      const coords = coordsForBuilding(after.location.building);
      await writeMovement({
        db,
        resourceId: assetCode,
        resource: { id: assetCode, ...after },
        toLocation: {
          campus: after.location.campus || "Main Campus",
          building: after.location.building,
          lat: coords.lat,
          lng: coords.lng
        },
        source: "transfer",
        triggeredBy: after.updatedBy || "transfer-actor",
        triggeredByRole: "system-transfer-listener",
        // Phase 3 v1: the transfer reason lives on the transfers/{id} audit
        // entry the client already wrote; propagating it here is Future Work.
        note: null,
        skipIfSameLocation: true
      });
    }
  }
);
