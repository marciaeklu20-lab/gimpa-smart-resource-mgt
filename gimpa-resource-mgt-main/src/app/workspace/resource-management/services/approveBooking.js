import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export const approveBooking = async (
  bookingId,
  approver
) => {

  await updateDoc(
    doc(db, "bookings", bookingId),
    {
      status: "approved",
      approvedBy: {
        uid: approver.uid,
        name: approver.fullName || null,
        role: approver.role || null
      },
      rejectedBy: null,
      decidedAt: serverTimestamp()
    }
  );

};
