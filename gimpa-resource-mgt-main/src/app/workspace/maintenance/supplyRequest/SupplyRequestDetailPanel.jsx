"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { relativeTime, formatDate } from "@/app/lib/resourceMeta";
import { PLATFORM_ADMINS } from "@/app/lib/roles";

import { updateSupplyRequestStatus } from "../services/supplyRequest/updateSupplyRequestStatus";

const STATUS_LABEL = {
  pending:   "Pending",
  approved:  "Approved",
  denied:    "Denied",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled"
};

const STORES_DECISION_ROLES = new Set([
  "Stores/Inventory Officer",
  ...PLATFORM_ADMINS
]);

export default function SupplyRequestDetailPanel({
  selectedRequest,
  currentUser,
  navigate,
  onClose
}) {

  const db = getFirestore(app);

  const [statusHistory, setStatusHistory] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  // pendingAction: "approve" | "deny" | "cancel" (single-modal flow)
  const [pendingAction, setPendingAction] = useState(null);
  // fulfilling: boolean — opens the FulfillModal (multi-row quantity editor)
  const [fulfilling, setFulfilling] = useState(false);

  useEffect(() => {
    if (!selectedRequest?.id) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [selectedRequest?.id]);

  useEffect(() => {
    if (!selectedRequest?.id) {
      setStatusHistory([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "supplyRequests", selectedRequest.id, "statusHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setStatusHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("supplyRequest statusHistory listener:", err)
    );
    return () => unsub();
  }, [selectedRequest?.id]);

  const isStoresDecider = currentUser
    && STORES_DECISION_ROLES.has(currentUser.role);
  const isRequester = currentUser?.uid
    && selectedRequest?.requesterId === currentUser.uid;

  const status = selectedRequest?.status || "pending";

  const canApproveDeny  = isStoresDecider && status === "pending";
  const canFulfill      = isStoresDecider && status === "approved";
  const canCancel       = isRequester     && status === "pending";

  const goToFault = () => {
    if (!navigate || !selectedRequest?.relatedFaultId) return;
    navigate({
      sidebar: "Maintenance",
      tab: "Faults",
      faultId: selectedRequest.relatedFaultId
    });
  };

  if (!selectedRequest) {
    return (
      <div className="fault-detail-panel fault-detail-empty">
        <p>Select a request to view details.</p>
      </div>
    );
  }

  return (
    <div className="fault-detail-panel">

      {onClose && (
        <button
          type="button"
          className="fault-detail-close"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          ×
        </button>
      )}

      <div className="fault-detail-header">
        <div className="supply-detail-title">
          <strong>Supply request</strong>
          <span className="supply-detail-id">#{selectedRequest.id.slice(0, 8)}</span>
        </div>
        <div className="fault-detail-pills">
          <span className={`fault-pill supply-status-${status}`}>
            {STATUS_LABEL[status] || status}
          </span>
        </div>
      </div>

      <div className="fault-detail-meta-grid">
        <div className="fault-detail-meta">
          <label>Requester</label>
          <div>
            {selectedRequest.requesterName || "—"}
            <span className="fault-detail-meta-sub">
              {selectedRequest.requesterRole}
            </span>
          </div>
        </div>
        <div className="fault-detail-meta">
          <label>Requested</label>
          <div
            title={selectedRequest.createdAt
              ? formatDate(selectedRequest.createdAt)
              : ""}
          >
            {selectedRequest.createdAt
              ? relativeTime(selectedRequest.createdAt, now)
              : "—"}
          </div>
        </div>
      </div>

      <div className="fault-detail-section">
        <label>Items</label>
        <table className="supply-items-table">
          <thead>
            <tr>
              <th>Supply</th>
              <th>Requested</th>
              <th>Issued</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {(selectedRequest.items || []).map((it, i) => (
              <tr key={i}>
                <td>{it.resourceName}</td>
                <td>{it.quantityRequested}</td>
                <td>
                  {it.quantityIssued != null
                    ? it.quantityIssued
                    : <span style={{ color: "#94a3b8" }}>—</span>}
                </td>
                <td>{it.unit || "pieces"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fault-detail-section">
        <label>Reason</label>
        <p className="fault-detail-description">{selectedRequest.reason}</p>
      </div>

      {selectedRequest.relatedFaultId && (
        <div className="fault-detail-section">
          <label>Linked fault</label>
          <button
            type="button"
            className="supply-fault-link"
            onClick={goToFault}
            title="Open the linked fault in Maintenance"
          >
            <strong>{selectedRequest.relatedResourceName || "Fault"}</strong>
            <span>{selectedRequest.relatedResourceId}</span>
          </button>
        </div>
      )}

      {status === "approved" && selectedRequest.approverNotes && (
        <div className="fault-detail-section">
          <label>Approver notes</label>
          <p className="fault-detail-description">{selectedRequest.approverNotes}</p>
        </div>
      )}

      {status === "denied" && selectedRequest.denialReason && (
        <div className="fault-detail-section">
          <label>Denial reason</label>
          <p className="fault-detail-description">{selectedRequest.denialReason}</p>
        </div>
      )}

      <div className="fault-detail-section">
        <label>Actions</label>
        {(canApproveDeny || canFulfill || canCancel) ? (
          <div className="fault-actions-row">
            {canApproveDeny && (
              <>
                <button
                  type="button"
                  className="fault-action-btn fault-action-success"
                  onClick={() => setPendingAction("approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="fault-action-btn fault-action-danger"
                  onClick={() => setPendingAction("deny")}
                >
                  Deny
                </button>
              </>
            )}
            {canFulfill && (
              <button
                type="button"
                className="fault-action-btn fault-action-primary"
                onClick={() => setFulfilling(true)}
              >
                Mark Fulfilled
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="fault-action-btn fault-action-danger"
                onClick={() => setPendingAction("cancel")}
              >
                Cancel Request
              </button>
            )}
          </div>
        ) : (
          <p className="fault-detail-terminal">
            {status === "fulfilled"
              ? "Fulfilled. Stores have issued these supplies."
              : status === "denied"
                ? "Denied. See the reason above."
                : status === "cancelled"
                  ? "Cancelled by the requester."
                  : "No actions available to you at this stage."}
          </p>
        )}
      </div>

      <div className="fault-detail-section">
        <label>Status history</label>
        {statusHistory.length === 0 ? (
          <p className="fault-detail-empty-text">No status changes yet.</p>
        ) : (
          <ul className="fault-history-list">
            {statusHistory.map((e) => (
              <li key={e.id} className="fault-history-item">
                <div>
                  {e.oldStatus
                    ? `${STATUS_LABEL[e.oldStatus] || e.oldStatus} → `
                    : ""}
                  <strong>{STATUS_LABEL[e.newStatus] || e.newStatus}</strong>
                  {e.notes && (
                    <span className="fault-history-note"> · {e.notes}</span>
                  )}
                  <div className="fault-history-actor">
                    {e.changedBy?.name || "Unknown"}
                    {e.changedBy?.role ? ` · ${e.changedBy.role}` : ""}
                  </div>
                </div>
                <div className="fault-history-time">
                  {e.changedAt ? relativeTime(e.changedAt, now) : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingAction && (
        <SimpleActionModal
          action={pendingAction}
          request={selectedRequest}
          currentUser={currentUser}
          onClose={() => setPendingAction(null)}
        />
      )}

      {fulfilling && (
        <FulfillModal
          request={selectedRequest}
          currentUser={currentUser}
          onClose={() => setFulfilling(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// SimpleActionModal — approve / deny / cancel
// ---------------------------------------------------------------

function SimpleActionModal({ action, request, currentUser, onClose }) {

  const config = useMemo(() => {
    if (action === "approve") {
      return {
        title: "Approve supply request",
        description: "Confirm these supplies can be issued from Stores.",
        notesLabel: "Approver notes",
        notesRequired: false,
        newStatus: "approved",
        submitLabel: "Approve",
        variant: "success"
      };
    }
    if (action === "deny") {
      return {
        title: "Deny supply request",
        description: "Reject this request. The requester sees your reason on the audit trail.",
        notesLabel: "Denial reason",
        notesRequired: true,
        newStatus: "denied",
        submitLabel: "Deny request",
        variant: "danger"
      };
    }
    return {
      title: "Cancel supply request",
      description: "Withdraw this request. Stores won't process it.",
      notesLabel: "Reason (optional)",
      notesRequired: false,
      newStatus: "cancelled",
      submitLabel: "Cancel request",
      variant: "danger"
    };
  }, [action]);

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = notes.trim();
  const notesValid = config.notesRequired ? trimmed.length > 0 : true;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    if (!notesValid) {
      setError(`${config.notesLabel} is required.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await updateSupplyRequestStatus({
        requestId: request.id,
        newStatus: config.newStatus,
        notes: trimmed,
        currentUser
      });
      onClose();
    } catch (err) {
      console.error("updateSupplyRequestStatus failed:", err);
      const code = err?.message;
      setError(
        code === "DENIAL_REASON_REQUIRED"
          ? "A denial reason is required."
          : code === "NOTES_TOO_LONG"
            ? "Notes are too long (max 1000 characters)."
            : "Could not update the request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fault-modal-overlay" role="dialog" aria-modal="true">
      <div className="fault-modal">
        <div className="fault-modal-header">
          <div>
            <h2>{config.title}</h2>
            <p>{config.description}</p>
          </div>
          <button
            type="button"
            className="fault-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="fault-modal-form" onSubmit={handleSubmit}>
          <div className="fault-field">
            <label>
              {config.notesLabel}
              {config.notesRequired && <span style={{ color: "#b91c1c" }}> *</span>}
              <span className="fault-field-counter">{trimmed.length} / 1000</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              disabled={submitting}
              autoFocus
            />
          </div>

          {error && <div className="fault-error-banner" role="alert">{error}</div>}

          <div className="fault-actions">
            <button
              type="button"
              className="fault-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Back
            </button>
            <button
              type="submit"
              className={`fault-submit-btn fault-submit-${config.variant}`}
              disabled={submitting || !notesValid}
            >
              {submitting ? "Saving…" : config.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// FulfillModal — Stores confirms quantities issued per line
// ---------------------------------------------------------------

function FulfillModal({ request, currentUser, onClose }) {

  const [items, setItems] = useState(() =>
    (request.items || []).map((it) => ({
      ...it,
      quantityIssued: it.quantityIssued ?? it.quantityRequested
    }))
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const allValid = items.every((it) => {
    const n = Number(it.quantityIssued);
    return Number.isFinite(n) && n >= 0;
  });

  const handleIssued = (i, v) => {
    setItems((arr) =>
      arr.map((it, idx) => idx === i ? { ...it, quantityIssued: v } : it)
    );
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting || !allValid) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateSupplyRequestStatus({
        requestId: request.id,
        newStatus: "fulfilled",
        notes: notes.trim(),
        items: items.map((it) => ({
          quantityIssued: Number(it.quantityIssued)
        })),
        currentUser
      });
      onClose();
    } catch (err) {
      console.error("updateSupplyRequestStatus (fulfill) failed:", err);
      setError("Could not mark fulfilled. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fault-modal-overlay" role="dialog" aria-modal="true">
      <div className="fault-modal supply-request-modal">
        <div className="fault-modal-header">
          <div>
            <h2>Mark fulfilled</h2>
            <p>
              Confirm the quantity issued per item. This logs the fulfillment
              but does not deduct inventory (tracked separately).
            </p>
          </div>
          <button
            type="button"
            className="fault-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="fault-modal-form" onSubmit={handleSubmit}>

          <div className="fault-field">
            <label>Items</label>
            <table className="supply-items-edit-table">
              <thead>
                <tr>
                  <th>Supply</th>
                  <th>Requested</th>
                  <th>Issued</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.resourceName}</td>
                    <td>{it.quantityRequested}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={it.quantityIssued}
                        onChange={(e) => handleIssued(i, e.target.value)}
                        required
                      />
                    </td>
                    <td>{it.unit || "pieces"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="fault-field">
            <label>
              Fulfillment notes (optional)
              <span className="fault-field-counter">{notes.trim().length} / 1000</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              disabled={submitting}
            />
          </div>

          {error && <div className="fault-error-banner" role="alert">{error}</div>}

          <div className="fault-actions">
            <button
              type="button"
              className="fault-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fault-submit-btn fault-submit-primary"
              disabled={submitting || !allValid}
            >
              {submitting ? "Saving…" : "Mark fulfilled"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
