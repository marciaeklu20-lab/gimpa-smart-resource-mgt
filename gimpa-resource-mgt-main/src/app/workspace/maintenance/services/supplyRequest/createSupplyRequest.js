import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 1000;
export const MAX_ITEMS = 20;

// Routing: Stores owns approve/fulfill; super_admin keeps override.
// Kept in sync by hand with firestore.rules' supplyRequests update gate.
const ROUTED_TO_ROLES = ["Stores/Inventory Officer", "super_admin"];

// Submit a new supply request. Mirrors createFault's batch pattern:
// one parent doc + initial statusHistory entry written atomically so
// a successful return guarantees both are in place.
//
// Throws one of:
//   USER_REQUIRED
//   ITEMS_REQUIRED | ITEM_INVALID | ITEMS_TOO_MANY
//   REASON_TOO_SHORT | REASON_TOO_LONG
export const createSupplyRequest = async ({
  relatedFault,
  items,
  reason,
  currentUser
}) => {

  if (!currentUser?.uid) throw new Error("USER_REQUIRED");

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("ITEMS_REQUIRED");
  }
  if (items.length > MAX_ITEMS) {
    throw new Error("ITEMS_TOO_MANY");
  }

  const normalizedItems = items.map((it) => {
    if (!it?.resourceId || !it?.resourceName) {
      throw new Error("ITEM_INVALID");
    }
    const qty = Number(it.quantityRequested);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("ITEM_INVALID");
    }
    const unit = (it.unit || "").trim() || "pieces";
    return {
      resourceId: String(it.resourceId),
      resourceName: String(it.resourceName),
      quantityRequested: qty,
      quantityIssued: null,
      unit
    };
  });

  const trimmedReason = (reason || "").trim();
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    throw new Error("REASON_TOO_SHORT");
  }
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw new Error("REASON_TOO_LONG");
  }

  const actor = {
    uid: currentUser.uid,
    name: currentUser.fullName || currentUser.email || "Unknown",
    role: currentUser.role || "unknown"
  };

  const reqRef = doc(collection(db, "supplyRequests"));

  const payload = {
    relatedFaultId: relatedFault?.id || null,
    relatedResourceId: relatedFault?.resourceId || null,
    relatedResourceName: relatedFault?.resourceName || null,

    items: normalizedItems,
    reason: trimmedReason,

    requesterId: currentUser.uid,
    requesterName: actor.name,
    requesterRole: currentUser.role || "unknown",

    status: "pending",
    routedToRoles: [...ROUTED_TO_ROLES],

    approvedBy: null,
    approvedAt: null,
    approverNotes: null,

    deniedAt: null,
    deniedBy: null,
    denialReason: null,

    fulfilledAt: null,
    fulfilledBy: null,

    cancelledAt: null,
    cancelledBy: null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const historyRef = doc(collection(reqRef, "statusHistory"));
  const historyEntry = {
    changedAt: serverTimestamp(),
    oldStatus: null,
    newStatus: "pending",
    notes: "Supply request submitted",
    changedBy: actor
  };

  const batch = writeBatch(db);
  batch.set(reqRef, payload);
  batch.set(historyRef, historyEntry);
  await batch.commit();

  return reqRef.id;
};
