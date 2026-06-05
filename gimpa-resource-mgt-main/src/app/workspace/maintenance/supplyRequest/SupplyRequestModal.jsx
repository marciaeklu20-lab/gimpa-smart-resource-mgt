"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "firebase/firestore";

import app from "@/firebase/config";

import { IoCloseOutline } from "react-icons/io5";
import { FaTimes, FaPlus } from "react-icons/fa";

import { categoriesForRole } from "@/app/lib/categoryResponsibility";
import { MAINTENANCE_ROLES } from "@/app/lib/roles";

import {
  createSupplyRequest,
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
  MAX_ITEMS
} from "../services/supplyRequest/createSupplyRequest";

const ERROR_MESSAGES = {
  USER_REQUIRED:    "You must be signed in to request supplies.",
  ITEMS_REQUIRED:   "Add at least one supply line.",
  ITEM_INVALID:     "Each row needs a resource and a positive quantity.",
  ITEMS_TOO_MANY:   `Up to ${MAX_ITEMS} rows per request.`,
  REASON_TOO_SHORT: `Reason must be at least ${MIN_REASON_LENGTH} characters.`,
  REASON_TOO_LONG:  `Reason must be at most ${MAX_REASON_LENGTH} characters.`
};

// Categories owned by Stores. Derived from the shared
// categoryResponsibility map so a future re-partition keeps the modal
// in sync without a code change here.
const SUPPLY_CATEGORIES = categoriesForRole("Stores/Inventory Officer");

const emptyRow = () => ({
  resourceId: "",
  resourceName: "",
  quantityRequested: 1,
  unit: "pieces"
});

export default function SupplyRequestModal({
  closeModal,
  lockedFault,
  currentUser
}) {

  const db = getFirestore(app);

  const [supplyResources, setSupplyResources] = useState([]);
  const [linkableFaults, setLinkableFaults] = useState([]);
  const [linkedFaultId, setLinkedFaultId] = useState(lockedFault?.id || "");
  const [rows, setRows] = useState([emptyRow()]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load the Stores-owned resource catalogue once. The user picks
  // items from this list — no live updates needed since the list is
  // small and the modal is short-lived.
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "resources"));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const filtered = all
          .filter((r) => SUPPLY_CATEGORIES.includes(r.category))
          .sort((a, b) =>
            (a.resourceName || "").localeCompare(b.resourceName || "")
          );
        setSupplyResources(filtered);
      } catch (e) {
        console.error("Failed to load supply resources:", e);
      }
    };
    load();
  }, []);

  // Faults the requester can link this supply request to — only ones
  // they own (reported, or assigned to them). Skipped when a fault is
  // already locked by the launch point.
  useEffect(() => {
    if (lockedFault?.id) return;
    if (!currentUser?.uid) return;
    const load = async () => {
      try {
        const isMaintenance = MAINTENANCE_ROLES.includes(currentUser.role);
        let docs = [];
        if (isMaintenance) {
          // Maintenance roles see all faults via rules — fetch open
          // ones so the dropdown isn't overwhelming. The dropdown
          // itself stays scrollable.
          const q = query(
            collection(db, "faults"),
            where("status", "in", ["pending", "acknowledged", "in_progress"]),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } else {
          const q = query(
            collection(db, "faults"),
            where("reporterId", "==", currentUser.uid),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        setLinkableFaults(docs);
      } catch (e) {
        console.error("Failed to load linkable faults:", e);
      }
    };
    load();
  }, [lockedFault?.id, currentUser?.uid, currentUser?.role]);

  const linkedFault = useMemo(() => {
    if (lockedFault) return lockedFault;
    if (!linkedFaultId) return null;
    return linkableFaults.find((f) => f.id === linkedFaultId) || null;
  }, [lockedFault, linkedFaultId, linkableFaults]);

  const handleRowChange = (idx, patch) => {
    setRows((rs) => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const handleResourceSelect = (idx, resourceId) => {
    const resource = supplyResources.find((r) => r.id === resourceId);
    handleRowChange(idx, {
      resourceId,
      resourceName: resource?.resourceName || ""
    });
  };

  const addRow = () => {
    if (rows.length >= MAX_ITEMS) return;
    setRows((rs) => [...rs, emptyRow()]);
  };

  const removeRow = (idx) => {
    setRows((rs) => rs.length === 1 ? rs : rs.filter((_, i) => i !== idx));
  };

  const trimmedReason = reason.trim();
  const rowsValid = rows.every((r) =>
    r.resourceId
    && r.resourceName
    && Number(r.quantityRequested) > 0
  );
  const reasonValid =
    trimmedReason.length >= MIN_REASON_LENGTH
    && trimmedReason.length <= MAX_REASON_LENGTH;
  const canSubmit = !submitting && rowsValid && reasonValid;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await createSupplyRequest({
        relatedFault: linkedFault
          ? {
              id: linkedFault.id,
              resourceId: linkedFault.resourceId,
              resourceName: linkedFault.resourceName
            }
          : null,
        items: rows.map((r) => ({
          resourceId: r.resourceId,
          resourceName: r.resourceName,
          quantityRequested: Number(r.quantityRequested),
          unit: r.unit
        })),
        reason: trimmedReason,
        currentUser
      });

      alert("Supply request submitted. Stores have been notified.");
      closeModal();
    } catch (err) {
      console.error("createSupplyRequest failed:", err);
      const code = err?.message;
      setErrorMessage(
        ERROR_MESSAGES[code]
        || "Failed to submit supply request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fault-modal-overlay" role="dialog" aria-modal="true">
      <div className="fault-modal supply-request-modal">

        <div className="fault-modal-header">
          <div>
            <h2>Request supplies</h2>
            <p>
              Ask Stores for tools, consumables, or maintenance equipment.
              {lockedFault && " This request will be linked to the fault below."}
            </p>
          </div>
          <button
            type="button"
            className="fault-modal-close"
            onClick={closeModal}
            aria-label="Close"
            disabled={submitting}
          >
            <IoCloseOutline size={28} />
          </button>
        </div>

        <form className="fault-modal-form" onSubmit={handleSubmit}>

          <div className="fault-field">
            <label>Linked fault {lockedFault && <span className="supply-locked-tag">locked</span>}</label>
            {lockedFault ? (
              <div className="fault-locked-resource">
                <strong>{lockedFault.resourceName}</strong>
                <span>{lockedFault.resourceId}</span>
              </div>
            ) : (
              <select
                value={linkedFaultId}
                onChange={(e) => setLinkedFaultId(e.target.value)}
              >
                <option value="">(none — standalone request)</option>
                {linkableFaults.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.resourceName} — {f.description?.slice(0, 60)}
                    {f.description?.length > 60 ? "…" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="fault-field">
            <label>
              Items
              <span className="fault-field-counter">{rows.length} / {MAX_ITEMS}</span>
            </label>

            <table className="supply-items-edit-table">
              <thead>
                <tr>
                  <th>Supply</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        value={row.resourceId}
                        onChange={(e) => handleResourceSelect(idx, e.target.value)}
                        required
                      >
                        <option value="">Select supply…</option>
                        {supplyResources.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.resourceName} ({r.category})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantityRequested}
                        onChange={(e) => handleRowChange(idx, {
                          quantityRequested: e.target.value
                        })}
                        required
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => handleRowChange(idx, { unit: e.target.value })}
                        placeholder="pieces"
                        maxLength={20}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="supply-row-remove"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1}
                        aria-label={`Remove row ${idx + 1}`}
                      >
                        <FaTimes />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              type="button"
              className="supply-add-row-btn"
              onClick={addRow}
              disabled={rows.length >= MAX_ITEMS}
            >
              <FaPlus /> Add another item
            </button>
          </div>

          <div className="fault-field">
            <label>
              Reason
              <span style={{ color: "#b91c1c" }}> *</span>
              <span className="fault-field-counter">
                {trimmedReason.length} / {MAX_REASON_LENGTH}
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REASON_LENGTH}
              placeholder="Why are these supplies needed? Stores will see this when reviewing."
              required
            />
            {trimmedReason.length > 0 && trimmedReason.length < MIN_REASON_LENGTH && (
              <p className="fault-field-hint warn">
                At least {MIN_REASON_LENGTH} characters needed.
              </p>
            )}
          </div>

          {errorMessage && (
            <div className="fault-error-banner" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="fault-actions">
            <button
              type="button"
              className="fault-cancel-btn"
              onClick={closeModal}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fault-submit-btn"
              disabled={!canSubmit}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
