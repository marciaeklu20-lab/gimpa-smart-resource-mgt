// Stage 4o Phase 2 — shared movement writer.
//
// Atomically (one batch) updates a resource's currentLocation and appends
// a row to the resourceMovements audit collection. Used by the Phase 2 QR
// check-in callable; Phase 3's booking / transfer / maintenance listeners
// will reuse it with their own `source` values.
//
// Runs under the Admin SDK (Cloud Functions), so it bypasses Firestore
// rules — the resourceMovements collection is client-write-denied and
// these writes are the only path that populates it.

import { FieldValue } from "firebase-admin/firestore";

// Keep only the four geo fields on each side of the transition — strips
// updatedAt / updatedBy / source so the `from`/`to` snapshots stay pure
// location records.
function pickLocationFields(loc) {
  return {
    campus: loc?.campus ?? null,
    building: loc?.building ?? null,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null
  };
}

export async function writeMovement({
  db,
  resourceId,
  resource,
  toLocation,
  source,
  triggeredBy,
  triggeredByRole,
  note = null
}) {
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  // Previous location: the existing currentLocation if the resource has
  // one, else fall back to its home location (campus/building only — a
  // pre-backfill resource has no lat/lng on its home record).
  const fromLocation = resource.currentLocation || {
    campus: resource.location?.campus ?? null,
    building: resource.location?.building ?? null,
    lat: null,
    lng: null
  };

  // 1. Update the resource's currentLocation (server-stamped).
  const resRef = db.collection("resources").doc(resourceId);
  batch.update(resRef, {
    currentLocation: {
      ...pickLocationFields(toLocation),
      updatedAt: now,
      updatedBy: triggeredBy,
      source
    }
  });

  // 2. Append the audit row.
  const moveRef = db.collection("resourceMovements").doc();
  batch.set(moveRef, {
    resourceId,
    resourceName: resource.resourceName || resource.name || resourceId,
    from: pickLocationFields(fromLocation),
    to: pickLocationFields(toLocation),
    source,
    triggeredBy,
    triggeredByRole: triggeredByRole || null,
    triggeredAt: now,
    note: note || null
  });

  await batch.commit();
  return moveRef.id;
}
