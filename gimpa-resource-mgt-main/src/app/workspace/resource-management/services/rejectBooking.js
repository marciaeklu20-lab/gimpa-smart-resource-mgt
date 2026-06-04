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

// Stage 4e.7: mirrors approveBooking — only roles in
// approvalRoutedTo (or platform admins as override) may reject.
export const rejectBooking = async (
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
      status: "rejected",
      rejectedBy: {
        uid: approver.uid,
        name: approver.fullName || null,
        role: approver.role || null
      },
      approvedBy: null,
      decidedAt: serverTimestamp(),
      // Distinct field so RecentActivity can orderBy("rejectedAt", "desc")
      // without having to also filter on status; mirrored in approveBooking.
      rejectedAt: serverTimestamp()
    }
  );

};
