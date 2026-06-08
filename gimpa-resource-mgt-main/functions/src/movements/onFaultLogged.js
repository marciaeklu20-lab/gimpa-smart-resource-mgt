// Stage 4o Phase 3 — when a SEVERE fault is logged, move the resource to
// the Maintenance Workshop automatically.
//
// Severity probe (Stage 4o investigation): the fault severity enum is
// cosmetic | minor | major | critical — there is no "high". Severe = the
// top two (major, critical). Cosmetic/minor faults leave the asset in
// place.

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { writeMovement } from "./writeMovement.js";
import { coordsForBuilding } from "./buildingCoordinates.js";
import { MAINTENANCE_BUILDING } from "./locationConstants.js";

if (!getApps().length) {
  initializeApp();
}

const SEVERE = new Set(["major", "critical"]);

export const onFaultLogged = onDocumentCreated(
  {
    document: "faults/{faultId}",
    region: "europe-west1"
  },
  async (event) => {
    const fault = event.data?.data();
    if (!fault || !SEVERE.has(fault.severity)) return;

    const db = getFirestore();

    // fault.resourceId is the resource's assetCode (= doc id).
    const resourceSnap = await db
      .collection("resources")
      .doc(fault.resourceId)
      .get();
    if (!resourceSnap.exists) return;
    const resource = { id: resourceSnap.id, ...resourceSnap.data() };

    const coords = coordsForBuilding(MAINTENANCE_BUILDING);

    await writeMovement({
      db,
      resourceId: fault.resourceId,
      resource,
      toLocation: {
        campus: resource.location?.campus || "Main Campus",
        building: MAINTENANCE_BUILDING,
        lat: coords.lat,
        lng: coords.lng
      },
      source: `fault:${event.params.faultId}`,
      // reporterId is the fault reporter's uid (Stage 4d schema).
      triggeredBy: fault.reporterId || "system",
      triggeredByRole: "system-fault-listener",
      note: `Automatic move to maintenance — fault ${event.params.faultId}: ${
        fault.description || "(no description)"
      }`,
      skipIfSameLocation: true
    });
  }
);
