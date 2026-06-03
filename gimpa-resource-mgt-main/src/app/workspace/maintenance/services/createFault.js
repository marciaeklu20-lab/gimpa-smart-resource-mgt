import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from "firebase/storage";

import app from "@/firebase/config";

import { MAINTENANCE_ROLES } from "@/app/lib/roles";

const db = getFirestore(app);
const storage = getStorage(app);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MIN_DESCRIPTION_LENGTH = 10;

export const SEVERITY_OPTIONS = [
  { value: "cosmetic", label: "Cosmetic",
    hint: "Surface damage, no functional impact." },
  { value: "minor",    label: "Minor",
    hint: "Still usable but degraded." },
  { value: "major",    label: "Major",
    hint: "Significantly degraded; needs attention." },
  { value: "critical", label: "Critical",
    hint: "Unusable or unsafe; immediate attention." }
];

export const SEVERITY_VALUES = SEVERITY_OPTIONS.map((s) => s.value);

// Submit a new fault. The doc id is generated client-side so the
// Storage path can reference it BEFORE the doc exists in Firestore.
// This lets us upload first, then atomic-commit the fault + initial
// statusHistory entry together — so a successful return guarantees
// both the doc and the audit entry are in place.
//
// Throws one of:
//   RESOURCE_REQUIRED | USER_REQUIRED
//   DESCRIPTION_TOO_SHORT | DESCRIPTION_TOO_LONG
//   IMAGE_TOO_LARGE | IMAGE_INVALID_TYPE
//   <upload-error.code>  // Storage SDK error code
export const createFault = async ({
  resource,
  description,
  severity,
  imageFile,
  currentUser,
  onProgress
}) => {

  if (!resource) throw new Error("RESOURCE_REQUIRED");
  if (!currentUser?.uid) throw new Error("USER_REQUIRED");

  if (!SEVERITY_VALUES.includes(severity)) {
    throw new Error("SEVERITY_INVALID");
  }

  const trimmed = (description || "").trim();
  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    throw new Error("DESCRIPTION_TOO_SHORT");
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error("DESCRIPTION_TOO_LONG");
  }

  if (imageFile) {
    if (imageFile.size > MAX_IMAGE_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }
    if (!imageFile.type || !imageFile.type.startsWith("image/")) {
      throw new Error("IMAGE_INVALID_TYPE");
    }
  }

  const faultRef = doc(collection(db, "faults"));

  let imageUrl = null;
  let imageStoragePath = null;

  if (imageFile) {
    imageStoragePath = `fault-images/${faultRef.id}/${imageFile.name}`;
    const sref = storageRef(storage, imageStoragePath);

    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(sref, imageFile, {
        contentType: imageFile.type
      });
      task.on(
        "state_changed",
        (snap) => {
          if (typeof onProgress === "function" && snap.totalBytes) {
            onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    imageUrl = await getDownloadURL(sref);
  }

  const actor = {
    uid: currentUser.uid,
    name: currentUser.fullName || currentUser.email || "Unknown",
    role: currentUser.role || "unknown"
  };

  const batch = writeBatch(db);

  batch.set(faultRef, {
    resourceId: resource.assetCode || resource.id,
    resourceName: resource.resourceName || resource.assetCode || "Unknown asset",
    resourceCategory: resource.category || null,

    reporterId: currentUser.uid,
    reporterName: actor.name,
    reporterRole: currentUser.role || "unknown",
    reporterDepartment: currentUser.department || null,

    description: trimmed,
    severity,

    imageUrl,
    imageStoragePath,

    status: "pending",
    routedToRoles: [...MAINTENANCE_ROLES],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // Stage 4e/4f workflow fields — present from creation so the
    // Firestore schema stays uniform and queries don't need to handle
    // missing-field edge cases.
    acknowledgedAt: null,
    acknowledgedBy: null,
    inProgressAt: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    newConditionAfterResolution: null
  });

  const historyRef = doc(collection(faultRef, "statusHistory"));
  batch.set(historyRef, {
    changedAt: serverTimestamp(),
    oldStatus: null,
    newStatus: "pending",
    notes: "Fault reported",
    changedBy: actor
  });

  await batch.commit();

  return faultRef.id;
};
