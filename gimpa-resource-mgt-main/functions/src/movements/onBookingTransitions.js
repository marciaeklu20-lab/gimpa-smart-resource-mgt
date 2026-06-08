// Stage 4o Phase 3 — scheduled booking → movement transitions.
//
// Every 5 minutes, sweep approved bookings and:
//   A. START  — startDate has passed and the booking hasn't moved yet
//      (locationTransitionState === "none"): move the resource to the
//      booking's chosen building, then flip state → "started".
//   B. RETURN — endDate has passed and the booking is "started": move the
//      resource back to its home building, then flip state → "returned".
//
// Schema probe notes:
//   - bookings store startDate/endDate as ISO STRINGS (not Timestamps), so
//     the range filter compares against new Date().toISOString().
//   - bookingLocation { campus, building } and locationTransitionState are
//     Phase 3 additions (written by createBooking + the backfill script).
//     Bookings missing bookingLocation are skipped WITHOUT erroring.
//   - The two queries each use two equality filters + one range filter, so
//     they require composite indexes (see firestore.indexes.json):
//       status + locationTransitionState + startDate
//       status + locationTransitionState + endDate

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { writeMovement } from "./writeMovement.js";
import { coordsForBuilding } from "./buildingCoordinates.js";

if (!getApps().length) {
  initializeApp();
}

const HOME_FALLBACK_BUILDING = "Main Administration Block";

export const onBookingTransitions = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "europe-west1"
  },
  async () => {
    const db = getFirestore();
    const nowIso = new Date().toISOString(); // startDate/endDate are ISO strings

    // ─── A. Starting ────────────────────────────────────────────────
    const startingSnap = await db
      .collection("bookings")
      .where("status", "==", "approved")
      .where("locationTransitionState", "==", "none")
      .where("startDate", "<=", nowIso)
      .get();

    for (const docSnap of startingSnap.docs) {
      const booking = { id: docSnap.id, ...docSnap.data() };

      // Legacy / unbackfilled bookings have no destination — skip cleanly.
      if (!booking.bookingLocation?.building) {
        console.warn(
          `[onBookingTransitions] Booking ${docSnap.id} has no bookingLocation; skipping start.`
        );
        continue;
      }

      const resourceSnap = await db
        .collection("resources")
        .doc(booking.resourceId)
        .get();
      if (!resourceSnap.exists) continue;
      const resource = { id: resourceSnap.id, ...resourceSnap.data() };

      const targetBuilding = booking.bookingLocation.building;
      const coords = coordsForBuilding(targetBuilding);

      await writeMovement({
        db,
        resourceId: booking.resourceId,
        resource,
        toLocation: {
          campus:
            booking.bookingLocation.campus ||
            resource.location?.campus ||
            "Main Campus",
          building: targetBuilding,
          lat: coords.lat,
          lng: coords.lng
        },
        source: `booking:${docSnap.id}`,
        triggeredBy: booking.requesterId || "system",
        triggeredByRole: "system-booking-listener",
        note: `Booking start: ${booking.purpose || "(no purpose)"}`,
        skipIfSameLocation: true,
        additionalUpdates: [
          { ref: docSnap.ref, data: { locationTransitionState: "started" } }
        ]
      });
    }

    // ─── B. Returning ───────────────────────────────────────────────
    const returningSnap = await db
      .collection("bookings")
      .where("status", "==", "approved")
      .where("locationTransitionState", "==", "started")
      .where("endDate", "<=", nowIso)
      .get();

    for (const docSnap of returningSnap.docs) {
      const booking = { id: docSnap.id, ...docSnap.data() };

      const resourceSnap = await db
        .collection("resources")
        .doc(booking.resourceId)
        .get();
      if (!resourceSnap.exists) continue;
      const resource = { id: resourceSnap.id, ...resourceSnap.data() };

      const homeBuilding =
        resource.location?.building || HOME_FALLBACK_BUILDING;
      const coords = coordsForBuilding(homeBuilding);

      await writeMovement({
        db,
        resourceId: booking.resourceId,
        resource,
        toLocation: {
          campus: resource.location?.campus || "Main Campus",
          building: homeBuilding,
          lat: coords.lat,
          lng: coords.lng
        },
        source: `booking-return:${docSnap.id}`,
        triggeredBy: booking.requesterId || "system",
        triggeredByRole: "system-booking-listener",
        note: `Booking ended: ${booking.purpose || "(no purpose)"}`,
        skipIfSameLocation: true,
        additionalUpdates: [
          { ref: docSnap.ref, data: { locationTransitionState: "returned" } }
        ]
      });
    }
  }
);
