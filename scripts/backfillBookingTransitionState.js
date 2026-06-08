// Stage 4o Phase 3 — one-shot backfill of the booking movement fields.
//
// Adds locationTransitionState + bookingLocation to existing APPROVED
// bookings so the onBookingTransitions scheduled function can pick them up.
// Idempotent — a booking that already carries locationTransitionState is
// left untouched, so re-running is safe.
//
// Run (same NODE_PATH trick as the Phase 2 backfill — firebase-admin must
// resolve, and it lives in the functions/ package):
//
//   cd /home/user/gimpa-smart-resource-mgt
//   NODE_PATH=gimpa-resource-mgt-main/functions/node_modules \
//     node scripts/backfillBookingTransitionState.js
//
// Per booking:
//   - locationTransitionState already set        → skip (idempotent)
//   - bookingLocation missing                    → default to the
//       resource's HOME location ("the booking happens where the resource
//       lives" for legacy data, so no phantom move fires)
//   - locationTransitionState derived from time vs now:
//       endDate   < now            → "returned"  (already over)
//       startDate <= now <= endDate → "started"  (in progress)
//       startDate > now            → "none"      (future — will transition)
//
// Only APPROVED bookings are processed; pending/rejected never move.
//
// NOTE: startDate/endDate are stored as ISO strings, so the time
// comparisons below are string comparisons against new Date().toISOString()
// — lexicographic order matches chronological order for ISO-8601.

const admin = require("firebase-admin");

admin.initializeApp({ projectId: "gimpa-resource-mgt" });
const db = admin.firestore();

(async () => {
  const nowIso = new Date().toISOString();

  const snap = await db
    .collection("bookings")
    .where("status", "==", "approved")
    .get();

  let updated = 0;
  let skipped = 0;
  let noLocation = 0;

  for (const doc of snap.docs) {
    const b = { id: doc.id, ...doc.data() };

    // Idempotent — already migrated.
    if (b.locationTransitionState) {
      skipped++;
      continue;
    }

    const patch = {};

    // Default bookingLocation to the resource's home location when absent,
    // so legacy bookings resolve to "no move" rather than being skipped
    // forever by the scheduled function.
    if (!b.bookingLocation?.building) {
      let homeCampus = "Main Campus";
      let homeBuilding = null;
      if (b.resourceId) {
        const resSnap = await db.collection("resources").doc(b.resourceId).get();
        if (resSnap.exists) {
          const loc = resSnap.data().location || {};
          homeCampus = loc.campus || homeCampus;
          homeBuilding = loc.building || null;
        }
      }
      if (homeBuilding) {
        patch.bookingLocation = { campus: homeCampus, building: homeBuilding };
      } else {
        // No resolvable home building — leave bookingLocation unset; the
        // scheduled function skips it defensively. Still set the state so
        // it isn't re-evaluated every run.
        noLocation++;
      }
    }

    // Derive the state from the booking's time window.
    let state;
    if (b.endDate && b.endDate < nowIso) {
      state = "returned";
    } else if (b.startDate && b.startDate <= nowIso) {
      state = "started";
    } else {
      state = "none";
    }
    patch.locationTransitionState = state;

    await doc.ref.update(patch);
    updated++;
  }

  console.log(
    `Booking backfill done. Updated: ${updated}. Skipped (already had state): ${skipped}. ` +
      `Of the updated, ${noLocation} had no resolvable home building (bookingLocation left unset).`
  );
  process.exit(0);
})().catch((err) => {
  console.error("Booking backfill failed:", err);
  process.exit(1);
});
