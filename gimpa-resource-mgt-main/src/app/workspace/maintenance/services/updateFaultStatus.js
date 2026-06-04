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

// Per the spec the workflow graph is:
//   pending → acknowledged → in_progress → resolved
//   pending → closed         (reject)
// We don't enforce the graph client-side here — the UI hides invalid
// buttons, and the Firestore rules gate writes to admin/maintenance.
const VALID_NEXT_STATUS = new Set([
  "acknowledged",
  "in_progress",
  "resolved",
  "closed"
]);

const MAX_NOTES_LENGTH = 2000;

// Build the actor payload stamped onto both the fault doc and the
// statusHistory entry. Mirrors the shape used by Stage 4d createFault
// (uid, name, role).
const actorFor = (currentUser) => ({
  uid: currentUser.uid,
  name: currentUser.fullName || currentUser.email || "Unknown",
  role: currentUser.role || "Unknown"
});

export const updateFaultStatus = async ({
  faultId,
  newStatus,
  notes,
  currentUser
}) => {

  if (!faultId) {
    throw new Error("MISSING_FAULT_ID");
  }

  if (!currentUser?.uid) {
    throw new Error("MISSING_USER");
  }

  if (!VALID_NEXT_STATUS.has(newStatus)) {
    throw new Error("INVALID_STATUS");
  }

  const trimmedNotes = (notes || "").trim();

  // Hard requirement on Mark Resolved / Reject — the UI also enforces
  // this but we keep the service defensive in case it's called from
  // elsewhere later.
  if ((newStatus === "resolved" || newStatus === "closed") && !trimmedNotes) {
    throw new Error("NOTES_REQUIRED");
  }

  if (trimmedNotes.length > MAX_NOTES_LENGTH) {
    throw new Error("NOTES_TOO_LONG");
  }

  // Read current status so the audit entry records the actual
  // transition (oldStatus → newStatus). One extra round-trip — the
  // statusHistory display in FaultDetailPanel relies on this field.
  const faultRef = doc(db, "faults", faultId);
  const snap = await getDoc(faultRef);
  if (!snap.exists()) {
    throw new Error("FAULT_NOT_FOUND");
  }
  const oldStatus = snap.data().status || null;

  const actor = actorFor(currentUser);

  // Status-specific timestamp + actor fields. The base patch sets the
  // current status; each branch below tacks on its own timestamps.
  const faultPatch = {
    status: newStatus,
    updatedAt: serverTimestamp()
  };

  if (newStatus === "acknowledged") {
    faultPatch.acknowledgedAt = serverTimestamp();
    faultPatch.acknowledgedBy = actor;
  } else if (newStatus === "in_progress") {
    faultPatch.inProgressAt = serverTimestamp();
  } else if (newStatus === "resolved") {
    faultPatch.resolvedAt = serverTimestamp();
    faultPatch.resolvedBy = actor;
    faultPatch.resolutionNotes = trimmedNotes;
  } else if (newStatus === "closed") {
    faultPatch.closedAt = serverTimestamp();
    faultPatch.closedBy = actor;
    // Stored as `notes` on the fault doc per the spec, so any future UI
    // can display "rejected because X" without sniffing the history.
    faultPatch.notes = trimmedNotes;
  }

  // statusHistory entry — always carries the transition. Reusing the
  // notes string for resolved/closed; for acknowledge / in_progress
  // notes are optional and may be empty.
  const historyRef = doc(
    collection(db, "faults", faultId, "statusHistory")
  );
  const historyEntry = {
    changedAt: serverTimestamp(),
    oldStatus,
    newStatus,
    notes: trimmedNotes,
    changedBy: actor
  };

  // Atomic — the audit entry MUST accompany the status flip.
  const batch = writeBatch(db);
  batch.update(faultRef, faultPatch);
  batch.set(historyRef, historyEntry);
  await batch.commit();

};
