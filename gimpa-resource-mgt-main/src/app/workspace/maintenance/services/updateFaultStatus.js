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

// Stage 4f: mirrors CONDITIONS in src/app/lib/resourceMeta.js. The
// resolver MUST pick one when transitioning to "resolved" — the choice
// becomes the asset's new condition.
const VALID_CONDITIONS = new Set([
  "excellent",
  "good",
  "fair",
  "poor",
  "out_of_service"
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
  newCondition,
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

  // Stage 4f: resolving REQUIRES a new condition. Anything else
  // ignores the field entirely (the UI doesn't even surface it).
  if (newStatus === "resolved") {
    if (!newCondition) {
      throw new Error("CONDITION_REQUIRED");
    }
    if (!VALID_CONDITIONS.has(newCondition)) {
      throw new Error("CONDITION_INVALID");
    }
  }

  // Read current status so the audit entry records the actual
  // transition (oldStatus → newStatus). One extra round-trip — the
  // statusHistory display in FaultDetailPanel relies on this field.
  const faultRef = doc(db, "faults", faultId);
  const snap = await getDoc(faultRef);
  if (!snap.exists()) {
    throw new Error("FAULT_NOT_FOUND");
  }
  const faultData = snap.data();
  const oldStatus = faultData.status || null;

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
    faultPatch.newConditionAfterResolution = newCondition;
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

  // Stage 4f: closing the maintenance loop. When resolving, the
  // fault's resource gets its condition flipped AND an immutable
  // conditionHistory entry written, both inside the same batch as
  // the fault transition. Either all four ops commit or none do.
  if (newStatus === "resolved") {
    const resourceDocId = faultData.resourceId;
    if (!resourceDocId) {
      throw new Error("FAULT_MISSING_RESOURCE");
    }
    const resourceRef = doc(db, "resources", resourceDocId);
    const resourceSnap = await getDoc(resourceRef);
    if (!resourceSnap.exists()) {
      // Defensive — the fault's resourceId points to a deleted asset.
      // Surfacing this lets the UI display a clean error rather than
      // committing an orphan fault update.
      throw new Error("RESOURCE_NOT_FOUND");
    }
    const oldCondition = resourceSnap.data().condition || null;

    batch.update(resourceRef, {
      condition: newCondition,
      updatedAt: serverTimestamp()
    });

    const condHistoryRef = doc(
      collection(db, "resources", resourceDocId, "conditionHistory")
    );
    batch.set(condHistoryRef, {
      changedAt: serverTimestamp(),
      oldCondition,
      newCondition,
      reason: `Resolved from fault: ${faultId}`,
      changedBy: actor
    });
  }

  await batch.commit();

};
