"use client";

// Stage 4i: chunked-batch bulk import for resources. Called by
// BulkImportModal AFTER parseResourceCsv has produced normalized rows
// and the operator has clicked "Import N valid rows".
//
// Pipeline:
//   1. Pre-check: drop any row whose assetCode already exists in
//      Firestore (a duplicate would clobber an existing asset).
//   2. Resolve custodianEmail → { uid, fullName } via a cached
//      users-collection lookup. Unknown emails downgrade to
//      custodianId=null with a per-row warning (the resource still
//      imports — we don't lose work over a typo).
//   3. Chunk the survivors into batches of ≤ CHUNK_SIZE resources.
//      Each resource emits 1 doc + 2 mandatory history entries
//      (+1 custodianHistory iff custodian) = 3–4 ops, so
//      CHUNK_SIZE * 4 ≤ 500 (Firestore's per-batch op limit).
//   4. Commit batches sequentially with a progress callback.
//   5. After all batches succeed, write ONE imports/{id} audit doc.
//   6. Return { successCount, failures } so the wizard's Step 3
//      can render success + per-row reasons.

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

// Firestore caps writes per batch at 500. Each resource = 3 ops
// minimum (resource + conditionHistory + lifecycleHistory) and may
// add a 4th (custodianHistory). 100 * 4 = 400 — comfortable margin.
const CHUNK_SIZE = 100;

// ---------------------------------------------------------------------
// resolveCustodianEmail — cached. Returns { uid, fullName } or null.
// ---------------------------------------------------------------------

const makeCustodianResolver = (db) => {
  const cache = new Map();

  return async (email) => {
    if (!email) return null;
    if (cache.has(email)) return cache.get(email);

    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("email", "==", email)
      )
    );

    if (snap.empty) {
      cache.set(email, null);
      return null;
    }

    const d = snap.docs[0];
    const data = d.data();
    const result = {
      uid: d.id,
      fullName: data.fullName || data.email || email
    };
    cache.set(email, result);
    return result;
  };
};

// ---------------------------------------------------------------------
// preCheckDuplicates — query existing resources for each assetCode.
// Done in series (not parallel) because typical batches are 50–200
// rows and we don't want to thrash Firestore with 200 concurrent reads.
// Returns Set<string> of assetCodes that already exist.
// ---------------------------------------------------------------------

const preCheckDuplicates = async (db, assetCodes) => {
  const duplicates = new Set();
  for (const code of assetCodes) {
    const snap = await getDoc(doc(db, "resources", code));
    if (snap.exists()) duplicates.add(code);
  }
  return duplicates;
};

// ---------------------------------------------------------------------
// chunk — pure split into N-sized arrays.
// ---------------------------------------------------------------------

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

// ---------------------------------------------------------------------
// bulkImportResources — public entry point.
//
// Args:
//   normalizedRows: rows whose `normalized` from parseResourceCsv is
//                   non-null (the caller has already filtered out
//                   parse-time errors).
//   currentUser:    { uid, role, fullName, email } — the operator.
//   csvFilename:    string — for the imports audit doc.
//   onProgress:     optional ({ done, total }) callback fired after
//                   each batch commit so the modal can show progress.
//
// Returns:
//   {
//     successCount: number,
//     failures: [{ rawIndex, assetCode, reason }],
//     importId:    string | null,
//     status:      "complete" | "partial" | "failed"
//   }
// ---------------------------------------------------------------------

export const bulkImportResources = async ({
  normalizedRows,
  currentUser,
  csvFilename,
  onProgress
}) => {

  const db = getFirestore(app);

  if (!currentUser || !currentUser.uid) {
    throw new Error("MISSING_USER");
  }

  const failures = [];
  const resolveCustodian = makeCustodianResolver(db);

  // -------------------------------------------------------------------
  // 1. Pre-check duplicates against Firestore.
  // -------------------------------------------------------------------
  const codes = normalizedRows.map((r) => r.normalized.assetCode);
  const dupes = await preCheckDuplicates(db, codes);

  const survivors = [];
  for (const row of normalizedRows) {
    const code = row.normalized.assetCode;
    if (dupes.has(code)) {
      failures.push({
        rawIndex:  row.rawIndex,
        assetCode: code,
        reason:    "Duplicate assetCode — a resource with this code already exists"
      });
    } else {
      survivors.push(row);
    }
  }

  // -------------------------------------------------------------------
  // 2. Resolve custodianEmail → uid for each surviving row. Unknown
  //    emails → null + warning. Cached lookups so duplicates are free.
  // -------------------------------------------------------------------
  for (const row of survivors) {
    const { normalized } = row;
    if (normalized.custodianEmail) {
      const resolved = await resolveCustodian(normalized.custodianEmail);
      if (resolved) {
        normalized._custodianId   = resolved.uid;
        normalized._custodianName = resolved.fullName;
      } else {
        normalized._custodianId   = null;
        normalized._custodianName = null;
        row.warnings = row.warnings || [];
        row.warnings.push({
          field: "custodianEmail",
          message: `Custodian email '${normalized.custodianEmail}' not found — resource will import without a custodian`
        });
      }
    } else {
      normalized._custodianId   = null;
      normalized._custodianName = null;
    }
  }

  // -------------------------------------------------------------------
  // 3+4. Chunked writeBatch. Each batch writes resources + history.
  // -------------------------------------------------------------------
  const actor = {
    uid:  currentUser.uid,
    name: currentUser.fullName || currentUser.email || "Unknown",
    role: currentUser.role     || "unknown"
  };

  const batches = chunk(survivors, CHUNK_SIZE);
  let successCount = 0;
  let done = 0;

  for (const group of batches) {
    const batch = writeBatch(db);

    for (const row of group) {
      const r = row.normalized;
      const resourceRef = doc(db, "resources", r.assetCode);

      const resourcePayload = {
        assetCode:       r.assetCode,
        resourceName:    r.resourceName,
        category:        r.category,
        type:            r.type,
        description:     r.description    || null,
        quantity:        r.quantity,
        capacity:        r.capacity       || null,
        lifecycleStatus: r.lifecycleStatus,
        condition:       r.condition,
        location:        r.location,
        custodianId:     r._custodianId,
        custodianName:   r._custodianName,
        custodianAssignedAt: r._custodianId ? serverTimestamp() : null,
        acquisitionDate: r.acquisitionDate,
        acquisitionCost: r.acquisitionCost,
        warrantyExpiry:  r.warrantyExpiry,
        vendor:          r.vendor         || null,
        responsibleRole: r.responsibleRole,
        createdAt:       new Date()
      };

      batch.set(resourceRef, resourcePayload);

      // Initial condition + lifecycle history. Provenance starts here.
      const condRef = doc(collection(resourceRef, "conditionHistory"));
      batch.set(condRef, {
        changedAt:    serverTimestamp(),
        oldCondition: null,
        newCondition: r.condition,
        reason:       "Initial registration (bulk import)",
        changedBy:    actor
      });

      const lifeRef = doc(collection(resourceRef, "lifecycleHistory"));
      batch.set(lifeRef, {
        changedAt: serverTimestamp(),
        oldStatus: null,
        newStatus: r.lifecycleStatus,
        reason:    "Initial registration (bulk import)",
        changedBy: actor
      });

      if (r._custodianId) {
        const custRef = doc(collection(resourceRef, "custodianHistory"));
        batch.set(custRef, {
          changedAt:        serverTimestamp(),
          oldCustodianId:   null,
          newCustodianId:   r._custodianId,
          reason:           "Initial assignment (bulk import)",
          changedBy:        actor
        });
      }
    }

    try {
      await batch.commit();
      successCount += group.length;
    } catch (err) {
      // The whole batch failed — surface each row's reason and keep
      // going to the next batch. We don't roll back successful prior
      // batches; the imports audit doc records the partial outcome.
      for (const row of group) {
        failures.push({
          rawIndex:  row.rawIndex,
          assetCode: row.normalized.assetCode,
          reason:    `Batch commit failed: ${err.message || String(err)}`
        });
      }
    }

    done += group.length;
    if (typeof onProgress === "function") {
      onProgress({ done, total: survivors.length });
    }
  }

  // -------------------------------------------------------------------
  // 5. Audit doc. Always written, even when nothing succeeded — the
  //    history view shouldn't silently drop attempts.
  // -------------------------------------------------------------------
  let status = "complete";
  if (successCount === 0 && failures.length > 0) status = "failed";
  else if (failures.length > 0) status = "partial";

  // Truncate errors at 50 entries — the audit doc shouldn't grow
  // unbounded with one-line-per-error logs.
  const truncatedErrors = failures.slice(0, 50).map((f) => ({
    row:    f.rawIndex,
    reason: f.reason
  }));

  let importId = null;
  try {
    const auditRef = await addDoc(collection(db, "imports"), {
      importedAt:    serverTimestamp(),
      importedBy:    {
        uid:  currentUser.uid,
        name: currentUser.fullName || currentUser.email || "Unknown",
        role: currentUser.role     || "unknown"
      },
      csvFilename:   csvFilename || "unknown.csv",
      resourceCount: successCount,
      failureCount:  failures.length,
      errors:        truncatedErrors,
      status
    });
    importId = auditRef.id;
  } catch (err) {
    // The audit doc is best-effort — if the operator's role doesn't
    // allow writing imports/, we still want to return the success
    // count so they see what landed.
    console.warn("Could not write imports audit doc:", err);
  }

  return {
    successCount,
    failures,
    importId,
    status
  };
};
