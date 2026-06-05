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

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 500;

// Deep-compare two location objects field by field. Treats undefined
// keys as empty strings so a {campus:"X"} object equals
// {campus:"X", building:""}. Both-null returns true (no change);
// one-null returns false (it's a change).
const sameLocation = (a, b) => {
  const aNull = !a || typeof a !== "object";
  const bNull = !b || typeof b !== "object";
  if (aNull && bNull) return true;
  if (aNull || bNull) return false;
  const norm = (v) => (typeof v === "string" ? v.trim() : "");
  return (
    norm(a.campus) === norm(b.campus)
    && norm(a.building) === norm(b.building)
    && norm(a.floor) === norm(b.floor)
    && norm(a.room) === norm(b.room)
  );
};

// Normalize the incoming custodian payload to the shape we persist.
// Returns null for "set to unassigned" cases (no uid, or explicit null).
const normalizeCustodian = (c) => {
  if (!c) return null;
  if (!c.uid) return null;
  return {
    uid: String(c.uid),
    name: c.name || "Unknown"
  };
};

// Same for location — produce a canonical 4-key shape so the audit
// entry is consistent regardless of which keys the caller passed.
// Returns null if every part is blank (caller's "no location" intent).
const normalizeLocation = (loc) => {
  if (!loc || typeof loc !== "object") return null;
  const out = {
    campus: (loc.campus || "").trim(),
    building: (loc.building || "").trim(),
    floor: (loc.floor || "").trim(),
    room: (loc.room || "").trim()
  };
  if (!out.campus && !out.building && !out.floor && !out.room) {
    return null;
  }
  return out;
};

// Transfer an asset to a new custodian and/or location, capturing
// both deltas in a single atomic batch alongside an immutable
// transfers/{id} audit entry. Mirrors the 4-op pattern from Stage 4f's
// updateFaultStatus — either everything commits or nothing does.
//
// Throws one of:
//   MISSING_RESOURCE_ID | MISSING_USER
//   RESOURCE_NOT_FOUND
//   REASON_TOO_SHORT | REASON_TOO_LONG
//   NO_CHANGES
//   CANNOT_TRANSFER_OWN_ASSET   (separation of duties; even admins)
export const transferAsset = async ({
  resourceId,
  newCustodian,
  newLocation,
  reason,
  currentUser
}) => {

  if (!resourceId) throw new Error("MISSING_RESOURCE_ID");
  if (!currentUser?.uid) throw new Error("MISSING_USER");

  const trimmedReason = (reason || "").trim();
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    throw new Error("REASON_TOO_SHORT");
  }
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw new Error("REASON_TOO_LONG");
  }

  const resourceRef = doc(db, "resources", resourceId);
  const snap = await getDoc(resourceRef);
  if (!snap.exists()) throw new Error("RESOURCE_NOT_FOUND");

  const data = snap.data();
  const oldCustodianId = data.custodianId || null;
  const oldCustodianName = data.custodianName || null;
  const oldLocation = data.location
    ? normalizeLocation(data.location)
    : null;

  const next = normalizeCustodian(newCustodian);
  const nextLoc = normalizeLocation(newLocation);

  const custodianChanged = (oldCustodianId || null) !== (next?.uid || null);
  const locationChanged = !sameLocation(oldLocation, nextLoc);

  if (!custodianChanged && !locationChanged) {
    throw new Error("NO_CHANGES");
  }

  // Separation of duties: the current custodian cannot transfer their
  // own asset. Applies to every role including admins — keeps the
  // demo honest about who's authorising the move.
  if (oldCustodianId && currentUser.uid === oldCustodianId) {
    throw new Error("CANNOT_TRANSFER_OWN_ASSET");
  }

  const actor = {
    uid: currentUser.uid,
    name: currentUser.fullName || currentUser.email || "Unknown",
    role: currentUser.role || "Unknown"
  };

  // Build the resource patch — keys are only included when their
  // delta is non-null, so the rules' affectedKeys narrowing (Stage
  // 4f) won't reject a partial transfer that only moves the asset
  // or only reassigns it.
  const resourcePatch = {
    updatedAt: serverTimestamp()
  };
  if (custodianChanged) {
    resourcePatch.custodianId = next?.uid || null;
    resourcePatch.custodianName = next?.name || null;
    resourcePatch.custodianAssignedAt = next ? serverTimestamp() : null;
  }
  if (locationChanged) {
    resourcePatch.location = nextLoc;
  }

  const transferRef = doc(
    collection(db, "resources", resourceId, "transfers")
  );
  const transferEntry = {
    transferredAt: serverTimestamp(),

    oldCustodian: oldCustodianId
      ? { uid: oldCustodianId, name: oldCustodianName || "Unknown" }
      : null,
    newCustodian: next,
    custodianChanged,

    oldLocation,
    newLocation: nextLoc,
    locationChanged,

    reason: trimmedReason,
    transferredBy: actor
  };

  const batch = writeBatch(db);
  batch.update(resourceRef, resourcePatch);
  batch.set(transferRef, transferEntry);
  await batch.commit();
};
