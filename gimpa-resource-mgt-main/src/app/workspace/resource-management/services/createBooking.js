import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

import { getBookingRecipients } from "./getBookingRecipients";

const db = getFirestore(app);

// Two ISO-string time ranges overlap iff each starts strictly before
// the other ends. Treats touching boundaries (A.end === B.start) as
// non-overlapping so back-to-back bookings are allowed.
const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  return aStart < bEnd && aEnd > bStart;
};

export const createBooking = async ({
  resource,
  user,
  purpose,
  startDate,
  endDate
}) => {

  // Reject zero-length / inverted ranges before the conflict query —
  // it's cheaper and the error message is clearer.
  if (!(startDate < endDate)) {
    throw new Error("INVALID_DATE_RANGE");
  }

  // Conflict check: pull every non-rejected booking for this resource
  // and look for any time overlap. We filter status server-side to keep
  // the result set small; the overlap test runs client-side because
  // Firestore can't express `(start < X) AND (end > Y)` in one query.
  const existingSnapshot = await getDocs(
    query(
      collection(db, "bookings"),
      where("resourceId", "==", resource.assetCode),
      where("status", "in", ["pending", "approved"])
    )
  );

  const conflict = existingSnapshot.docs.find((docSnap) => {
    const data = docSnap.data();
    return rangesOverlap(
      startDate,
      endDate,
      data.startDate,
      data.endDate
    );
  });

  if (conflict) {
    throw new Error("BOOKING_CONFLICT");
  }

  const routing = getBookingRecipients({
    requesterRole: user.role,
    requesterDepartment: user.department
  });

  await addDoc(collection(db, "bookings"), {

    resourceId: resource.assetCode,
    resourceName: resource.resourceName,

    requesterId: user.uid,
    requesterName: user.fullName,
    requesterEmail: user.email,

    requesterRole: user.role,
    requesterDepartment:
      user.department || null,

    approvalRoute:
      routing.approvalRoute,

    visibleToRoles:
      routing.targetRoles,

    visibleToDepartment:
      routing.department,

    purpose,
    startDate,
    endDate,

    status: "pending",

    approvedBy: null,
    rejectedBy: null,

    createdAt: serverTimestamp()
  });

};
