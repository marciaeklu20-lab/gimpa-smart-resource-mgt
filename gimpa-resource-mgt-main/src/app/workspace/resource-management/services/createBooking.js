import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

import { getBookingRecipients } from "./getBookingRecipients";

const db = getFirestore(app);

export const createBooking = async ({
  resource,
  user,
  purpose,
  startDate,
  endDate
}) => {

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