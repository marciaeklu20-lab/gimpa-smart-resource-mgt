import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

import { PLATFORM_ADMINS } from "@/app/lib/roles";

const db = getFirestore(app);

// Stage 4e.7: approval routes through the partitioned approvalRoutedTo
// list. A user may only approve if their role is in that list (or
// they're a platform admin — super_admin/Secretariat Admin/IT Officer
// retain override). We do the check client-side AND in rules; the
// client check produces a clearer error message before the round-trip.
export const approveBooking = async (
  bookingId,
  approver
) => {

  if (!approver?.role) {
    throw new Error("MISSING_USER");
  }

  const bookingRef = doc(db, "bookings", bookingId);
  const snap = await getDoc(bookingRef);
  if (!snap.exists()) {
    throw new Error("BOOKING_NOT_FOUND");
  }
  const booking = snap.data();

  const routedTo = Array.isArray(booking.approvalRoutedTo)
    ? booking.approvalRoutedTo
    : [];

  const isPlatformAdmin = PLATFORM_ADMINS.includes(approver.role);
  const isRouted = routedTo.includes(approver.role);

  if (!isPlatformAdmin && !isRouted) {
    const route = routedTo.length > 0 ? routedTo.join(", ") : "no roles";
    const err = new Error(`NOT_ROUTED:${route}`);
    err.routedTo = routedTo;
    throw err;
  }

  await updateDoc(
    bookingRef,
    {
      status: "approved",
      approvedBy: {
        uid: approver.uid,
        name: approver.fullName || null,
        role: approver.role || null
      },
      rejectedBy: null,
      decidedAt: serverTimestamp(),
      // Distinct field so RecentActivity can orderBy("approvedAt", "desc")
      // without having to also filter on status; mirrored in rejectBooking.
      approvedAt: serverTimestamp()
    }
  );

};
