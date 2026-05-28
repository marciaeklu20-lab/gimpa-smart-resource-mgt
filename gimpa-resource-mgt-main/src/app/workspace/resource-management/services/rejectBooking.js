import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export const rejectBooking = async (
  bookingId,
  approver
) => {

  await updateDoc(
    doc(db, "bookings", bookingId),
    {
      status: "rejected",
      rejectedBy: {
        uid: approver.uid,
        name: approver.fullName || null,
        role: approver.role || null
      },
      approvedBy: null,
      decidedAt: serverTimestamp()
    }
  );

};
