import {
  getFirestore,
  collection,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

const VALID_NEXT_STATUS = new Set([
  "approved",
  "denied",
  "fulfilled",
  "cancelled"
]);

const MAX_NOTES_LENGTH = 1000;

const actorFor = (currentUser) => ({
  uid: currentUser.uid,
  name: currentUser.fullName || currentUser.email || "Unknown",
  role: currentUser.role || "Unknown"
});

// Normalize the fulfillment items array. Caller passes the live items
// list with quantityIssued filled in per row. Anything else (missing
// row, non-numeric qty) falls back to quantityRequested.
const normalizeFulfilledItems = (existingItems, fulfilledItems) => {
  if (!Array.isArray(fulfilledItems)) return existingItems;
  return existingItems.map((it, i) => {
    const incoming = fulfilledItems[i];
    const qty = incoming?.quantityIssued;
    const num = Number(qty);
    return {
      ...it,
      quantityIssued: Number.isFinite(num) && num >= 0 ? num : it.quantityRequested
    };
  });
};

// Update a supply request's status. Mirrors updateFaultStatus's
// writeBatch pattern: read-current → patch parent + append
// statusHistory entry atomically.
//
// Throws:
//   MISSING_REQUEST_ID | MISSING_USER | INVALID_STATUS
//   REQUEST_NOT_FOUND
//   NOTES_TOO_LONG
//   DENIAL_REASON_REQUIRED   (denied without denialReason)
export const updateSupplyRequestStatus = async ({
  requestId,
  newStatus,
  notes,
  items,
  currentUser
}) => {

  if (!requestId) throw new Error("MISSING_REQUEST_ID");
  if (!currentUser?.uid) throw new Error("MISSING_USER");
  if (!VALID_NEXT_STATUS.has(newStatus)) throw new Error("INVALID_STATUS");

  const trimmedNotes = (notes || "").trim();

  if (newStatus === "denied" && !trimmedNotes) {
    throw new Error("DENIAL_REASON_REQUIRED");
  }

  if (trimmedNotes.length > MAX_NOTES_LENGTH) {
    throw new Error("NOTES_TOO_LONG");
  }

  const reqRef = doc(db, "supplyRequests", requestId);
  const snap = await getDoc(reqRef);
  if (!snap.exists()) throw new Error("REQUEST_NOT_FOUND");

  const existing = snap.data();
  const oldStatus = existing.status || null;
  const actor = actorFor(currentUser);

  const patch = {
    status: newStatus,
    updatedAt: serverTimestamp()
  };

  if (newStatus === "approved") {
    patch.approvedAt = serverTimestamp();
    patch.approvedBy = actor;
    patch.approverNotes = trimmedNotes || null;
  } else if (newStatus === "denied") {
    patch.deniedAt = serverTimestamp();
    patch.deniedBy = actor;
    patch.denialReason = trimmedNotes;
  } else if (newStatus === "fulfilled") {
    patch.fulfilledAt = serverTimestamp();
    patch.fulfilledBy = actor;
    patch.items = normalizeFulfilledItems(existing.items || [], items);
  } else if (newStatus === "cancelled") {
    patch.cancelledAt = serverTimestamp();
    patch.cancelledBy = actor;
  }

  const historyRef = doc(
    collection(db, "supplyRequests", requestId, "statusHistory")
  );
  const historyEntry = {
    changedAt: serverTimestamp(),
    oldStatus,
    newStatus,
    notes: trimmedNotes,
    changedBy: actor
  };

  const batch = writeBatch(db);
  batch.update(reqRef, patch);
  batch.set(historyRef, historyEntry);
  await batch.commit();
};
