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

const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

// Build the actor payload stamped onto the fault doc and assignmentHistory
// entry. Mirrors the shape used by updateFaultStatus / createFault
// (uid, name, role).
const actorFor = (currentUser) => ({
  uid: currentUser.uid,
  name: currentUser.fullName || currentUser.email || "Unknown",
  role: currentUser.role || "Unknown"
});

// Normalize the newAssignee param. The caller passes either a user
// object {uid, name, role} (assign / reassign) or null (release).
// Anything else is treated as a release for safety.
const normalizeAssignee = (newAssignee) => {
  if (!newAssignee) return null;
  if (!newAssignee.uid) return null;
  return {
    uid: newAssignee.uid,
    name: newAssignee.name || "Unknown",
    role: newAssignee.role || "Unknown"
  };
};

export const assignFault = async ({
  faultId,
  newAssignee,
  reason,
  currentUser
}) => {

  if (!faultId) {
    throw new Error("MISSING_FAULT_ID");
  }

  if (!currentUser?.uid) {
    throw new Error("MISSING_USER");
  }

  const trimmedReason = (reason || "").trim();

  if (trimmedReason.length < MIN_REASON_LENGTH) {
    throw new Error("REASON_TOO_SHORT");
  }

  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw new Error("REASON_TOO_LONG");
  }

  // Read the fault to capture the prior assignee for the audit entry.
  // One extra round-trip; assignmentHistory display relies on this.
  const faultRef = doc(db, "faults", faultId);
  const snap = await getDoc(faultRef);
  if (!snap.exists()) {
    throw new Error("FAULT_NOT_FOUND");
  }

  const oldAssignee = snap.data().assignedTo || null;
  const next = normalizeAssignee(newAssignee);
  const actor = actorFor(currentUser);

  // Append-only audit entry — every assignment change (assign,
  // reassign, release) gets one row.
  const historyRef = doc(
    collection(db, "faults", faultId, "assignmentHistory")
  );
  const historyEntry = {
    changedAt: serverTimestamp(),
    oldAssignee,
    newAssignee: next,
    reason: trimmedReason,
    changedBy: actor
  };

  // Atomic — the audit entry MUST accompany the assignment change so
  // the history is never out of step with the fault doc.
  const batch = writeBatch(db);
  batch.update(faultRef, {
    assignedTo: next,
    assignedAt: next ? serverTimestamp() : null,
    assignedBy: next ? actor : null,
    updatedAt: serverTimestamp()
  });
  batch.set(historyRef, historyEntry);
  await batch.commit();

};
