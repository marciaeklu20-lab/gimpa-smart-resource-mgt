import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

import { getBookingRecipients } from "./getBookingRecipients";
import { responsibleRoleForCategory } from "@/app/lib/categoryResponsibility";

const db = getFirestore(app);

// Stage 4e.7: who needs to see/approve a booking is now derived from
// the resource's responsibleRole — the category-partitioned owner —
// plus Secretariat Admin and super_admin as the always-on escalation
// path. Denormalized onto the booking doc so subscribeBookings can
// filter with a single array-contains query.
const approvalRouteFor = (resource) => {
  const route = ["Secretariat Admin", "super_admin"];
  const responsible = resource?.responsibleRole
    || responsibleRoleForCategory(resource?.category);
  if (responsible && !route.includes(responsible)) {
    route.unshift(responsible);
  }
  return route;
};

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

  // Re-fetch the resource so the lifecycle gate runs against canonical
  // state, not whatever the resource picker had cached. A resource
  // could have flipped to in_maintenance / retired since the page
  // loaded.
  const resourceSnap = await getDoc(
    doc(db, "resources", resource.assetCode)
  );
  if (!resourceSnap.exists()) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const liveResource = resourceSnap.data();
  // Resources created before Stage 4a have no lifecycleStatus field —
  // treat that as active so legacy data keeps working.
  const lifecycleStatus = liveResource.lifecycleStatus || "active";
  if (lifecycleStatus !== "active") {
    throw new Error(`RESOURCE_NOT_BOOKABLE:${lifecycleStatus}`);
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

  // Stage 4e.7: approvalRoutedTo replaces visibleToRoles as the
  // routing-and-permission field. Snapshot the resource's category
  // so the listener / rules / approve-button never have to round-trip
  // to /resources.
  const approvalRoutedTo = approvalRouteFor(liveResource);

  await addDoc(collection(db, "bookings"), {

    resourceId: resource.assetCode,
    resourceName: resource.resourceName || `${resource.category} (${resource.assetCode})`,
    resourceCategory: liveResource.category || resource.category || null,
    resourceResponsibleRole:
      liveResource.responsibleRole
      || responsibleRoleForCategory(liveResource.category)
      || null,

    requesterId: user.uid,
    requesterName: user.fullName,
    requesterEmail: user.email,

    requesterRole: user.role,
    requesterDepartment:
      user.department || null,

    approvalRoute:
      routing.approvalRoute,

    // Legacy Stage 4 routing fields. Kept so any orphaned reader still
    // works, but subscribeBookings/approveBooking now key off
    // approvalRoutedTo. Safe to remove once nothing references them.
    visibleToRoles:
      routing.targetRoles,

    visibleToDepartment:
      routing.department,

    approvalRoutedTo,

    purpose,
    startDate,
    endDate,

    status: "pending",

    approvedBy: null,
    rejectedBy: null,

    createdAt: serverTimestamp()
  });

};
