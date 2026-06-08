// Stage 4o Phase 2 — shared movement writer.
//
// Atomically (one batch) updates a resource's currentLocation and appends
// a row to the resourceMovements audit collection. Used by the Phase 2 QR
// check-in callable; Phase 3's booking / transfer / maintenance listeners
// reuse it with their own `source` values.
//
// Runs under the Admin SDK (Cloud Functions), so it bypasses Firestore
// rules — the resourceMovements collection is client-write-denied and
// these writes are the only path that populates it.
//
// Stage 4o Phase 3 adds two optional params:
//   - skipIfSameLocation: when true, a no-op move (the resource is already
//     at toLocation.building) is suppressed — returns null, writes nothing.
//     The automatic listeners pass true so they don't spam the audit log;
//     the manual QR check-in leaves it false (a deliberate check-in should
//     always be recorded, even "still here").
//   - additionalUpdates: extra { ref, data } writes folded into the SAME
//     batch as the resource update + audit row, so e.g. a booking's
//     locationTransitionState advances atomically with the move.

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
  note = null,
  skipIfSameLocation = false,
  additionalUpdates = []
}) {
  // Phase 3 no-op guard: if the resource is already at the target building,
  // the move would be audit-log noise. Skip the whole batch (including any
  // additionalUpdates — the caller's state-machine advance is also skipped,
  // which is correct: nothing moved, so the booking shouldn't flip to
  // "started"/"returned" off the back of a phantom move). Building-level
  // comparison only — Phase 3 movements are building-granular.
  if (
    skipIfSameLocation &&
    resource.currentLocation?.building === toLocation.building
  ) {
    return null;
  }

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

  // 3. Phase 3: fold in any caller-supplied writes (e.g. advancing a
  //    booking's locationTransitionState) so they commit atomically with
  //    the move. Each entry is { ref, data } and is applied as an update.
  for (const op of additionalUpdates) {
    if (op?.ref && op?.data) {
      batch.update(op.ref, op.data);
    }
  }

  await batch.commit();
  return moveRef.id;
}
