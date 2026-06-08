// Stage 4o Phase 2 — QR check-in callable.
//
// Lets an approved, signed-in user record that a resource is now at a
// given building. Verifies auth + approval server-side (never trusts a
// client-claimed role), resolves the building to coordinates, and writes
// the move via the shared writeMovement helper (currentLocation update +
// resourceMovements audit row, atomically).
//
// Phase 2 only: source is always "qr-checkin". Phase 3 adds booking /
// transfer / maintenance sources through the same writeMovement path.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { writeMovement } from "./movements/writeMovement.js";
import { coordsForBuilding, BUILDING_COORDINATES } from "./movements/buildingCoordinates.js";

if (!getApps().length) {
  initializeApp();
}

const OPTS = {
  region: "europe-west1",
  cors: true
};

export const checkInResource = onCall(OPTS, async (request) => {
  // 1. Auth.
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required to check in a resource.");
  }

  const { assetCode, building, floorRoom, note } = request.data || {};

  if (!assetCode || typeof assetCode !== "string") {
    throw new HttpsError("invalid-argument", "A resource assetCode is required.");
  }
  if (!building || typeof building !== "string") {
    throw new HttpsError("invalid-argument", "A building is required.");
  }
  if (!(building in BUILDING_COORDINATES)) {
    throw new HttpsError("invalid-argument", `Unknown building: ${building}`);
  }

  const db = getFirestore();

  // 2. Approval check — any approved role may check in equipment (a
  //    Lecturer moving booked kit is a valid case). Only fully
  //    unapproved / unknown users are blocked.
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : null;
  if (!userData || userData.approved !== true) {
    throw new HttpsError(
      "permission-denied",
      "Your account must be approved before you can check in resources."
    );
  }

  // 3. Load the resource.
  const resRef = db.collection("resources").doc(assetCode);
  const resSnap = await resRef.get();
  if (!resSnap.exists) {
    throw new HttpsError("not-found", `Resource ${assetCode} does not exist.`);
  }
  const resource = { id: resSnap.id, ...resSnap.data() };

  // 4. Resolve the target location. Campus comes from the resource's
  //    home record (Phase 2 check-in changes building within campus);
  //    coordinates come from the building table.
  const coords = coordsForBuilding(building);
  const trimmedRoom = typeof floorRoom === "string" ? floorRoom.trim() : "";
  const toLocation = {
    campus: resource.location?.campus || "Unknown",
    building,
    lat: coords.lat,
    lng: coords.lng,
    // floor/room is recorded on the movement note only — currentLocation
    // stays building-level for Phase 2 (room-level coords are Future Work).
  };

  const cleanNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;
  const composedNote = trimmedRoom
    ? `${trimmedRoom}${cleanNote ? ` — ${cleanNote}` : ""}`
    : cleanNote;

  // 5. Write the move (currentLocation + audit row).
  try {
    const moveId = await writeMovement({
      db,
      resourceId: assetCode,
      resource,
      toLocation,
      source: "qr-checkin",
      triggeredBy: uid,
      triggeredByRole: userData.role || null,
      note: composedNote
    });

    return {
      ok: true,
      moveId,
      building,
      assetCode
    };
  } catch (err) {
    console.error("[checkInResource] write failed:", err);
    throw new HttpsError("internal", "Could not record the check-in. Please try again.");
  }
});
