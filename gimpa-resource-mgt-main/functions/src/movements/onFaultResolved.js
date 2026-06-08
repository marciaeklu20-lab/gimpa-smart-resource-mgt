// Stage 4o Phase 3 — when a fault transitions INTO "resolved", move the
// resource back to its home location.
//
// Status enum probe: pending → acknowledged → in_progress → resolved (plus
// "closed" for rejects). We act only on the edge into "resolved", never on
// idempotent re-writes or other transitions. resolvedBy is an actor object
// { uid, name, role } (Stage 4f), so we read resolvedBy.uid for triggeredBy.

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { writeMovement } from "./writeMovement.js";
import { coordsForBuilding } from "./buildingCoordinates.js";

if (!getApps().length) {
  initializeApp();
}

const HOME_FALLBACK_BUILDING = "Main Administration Block";

export const onFaultResolved = onDocumentUpdated(
  {
    document: "faults/{faultId}",
    region: "europe-west1"
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only the transition INTO resolved — not resolved→resolved re-writes
    // or any other status change.
    const wasResolved = before.status === "resolved";
    const isResolved = after.status === "resolved";
    if (wasResolved || !isResolved) return;

    const db = getFirestore();

    const resourceSnap = await db
      .collection("resources")
      .doc(after.resourceId)
      .get();
    if (!resourceSnap.exists) return;
    const resource = { id: resourceSnap.id, ...resourceSnap.data() };

    const homeBuilding = resource.location?.building || HOME_FALLBACK_BUILDING;
    const coords = coordsForBuilding(homeBuilding);

    await writeMovement({
      db,
      resourceId: after.resourceId,
      resource,
      toLocation: {
        campus: resource.location?.campus || "Main Campus",
        building: homeBuilding,
        lat: coords.lat,
        lng: coords.lng
      },
      source: `maintenance-return:${event.params.faultId}`,
      // resolvedBy is an actor object { uid, name, role }.
      triggeredBy: after.resolvedBy?.uid || "system",
      triggeredByRole: "system-fault-listener",
      note: `Automatic return to home — fault ${event.params.faultId} resolved`,
      skipIfSameLocation: true
    });
  }
);
