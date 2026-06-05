"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { relativeTime, formatDate } from "@/app/lib/resourceMeta";
import { MAINTENANCE_ADMINS, MAINTENANCE_ROLES } from "@/app/lib/roles";

import { updateFaultStatus } from "./services/updateFaultStatus";
import { assignFault } from "./services/assignFault";

// Lazy-load FaultChat — same chunk-splitting trick we used on
// ReportFaultModal in Stage 4d. The chat brings in its own Firestore
// listener + send service; deferring it keeps the FaultDetailPanel
// chunk lean enough for the constrained-memory build worker.
const FaultChat = dynamic(
  () => import("./FaultChat"),
  { ssr: false }
);

// AssignFaultModal also lazy-loaded — it fetches the maintenance-staff
// user list and only opens on demand, so deferring it keeps the
// detail-panel chunk minimal.
const AssignFaultModal = dynamic(
  () => import("./AssignFaultModal"),
  { ssr: false }
);

// Stage 4e.8: also lazy. Brings in the supplyRequest service + the
// resource catalogue fetch — no point in paying that cost unless the
// user actually opens it.
const SupplyRequestModal = dynamic(
  () => import("./supplyRequest/SupplyRequestModal"),
  { ssr: false }
);

const SEVERITY_LABEL = {
  cosmetic: "Cosmetic",
  minor:    "Minor",
  major:    "Major",
  critical: "Critical"
};

const STATUS_LABEL = {
  pending:      "Pending",
  acknowledged: "Acknowledged",
  in_progress:  "In Progress",
  resolved:     "Resolved",
  closed:       "Closed"
};

const severityPillClass = (s) => `fault-pill fault-severity-${s || "minor"}`;
const statusPillClass   = (s) => `fault-pill fault-status-${s || "pending"}`;

// Status → action button configs. Each action carries the destination
// status, the modal title/blurb, and whether notes are required.
// Empty array = terminal status, no transitions allowed.
const ACTIONS_BY_STATUS = {
  pending: [
    {
      key: "acknowledge",
      label: "Acknowledge",
      newStatus: "acknowledged",
      variant: "primary",
      title: "Acknowledge fault",
      description: "Confirm that you've received this fault report and will act on it.",
      notesLabel: "Optional notes",
      notesRequired: false,
      submitLabel: "Acknowledge"
    },
    {
      key: "reject",
      label: "Reject",
      newStatus: "closed",
      variant: "danger",
      title: "Reject fault",
      description: "Close this fault without action. The reporter will see the closure reason in the audit trail.",
      notesLabel: "Rejection reason",
      notesRequired: true,
      submitLabel: "Reject fault"
    }
  ],
  acknowledged: [
    {
      key: "start_work",
      label: "Start Work",
      newStatus: "in_progress",
      variant: "primary",
      title: "Start work on this fault",
      description: "Mark this fault as actively being addressed.",
      notesLabel: "Optional notes",
      notesRequired: false,
      submitLabel: "Start work"
    }
  ],
  in_progress: [
    {
      key: "mark_resolved",
      label: "Mark Resolved",
      newStatus: "resolved",
      variant: "success",
      title: "Mark fault resolved",
      description: "Record what was done so the reporter sees it on the audit trail.",
      notesLabel: "Resolution notes",
      notesRequired: true,
      submitLabel: "Mark resolved"
    }
  ],
  resolved: [],
  closed: []
};

export default function FaultDetailPanel({
  selectedFault,
  currentUser,
  navigate,
  onClose
}) {

  const db = getFirestore(app);

  const [statusHistory, setStatusHistory] = useState([]);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [showAssignmentHistory, setShowAssignmentHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Stage 4e action modal state. `pendingAction` is the config object
  // from ACTIONS_BY_STATUS or null.
  const [pendingAction, setPendingAction] = useState(null);

  // Stage 4e.5 assignment modal state. Three independent surfaces:
  //   - showAssignModal: full AssignFaultModal (admin assign/reassign)
  //   - pendingAssignmentChange: { type, ... } for claim or release
  //     handled by AssignmentConfirmModal below
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pendingAssignmentChange, setPendingAssignmentChange] = useState(null);

  // Stage 4e.8: supply request launcher. Opens the SupplyRequestModal
  // with this fault pre-linked.
  const [showSupplyModal, setShowSupplyModal] = useState(false);

  // Tick the clock so relative-time strings stay current without a
  // re-fetch.
  useEffect(() => {
    if (!selectedFault?.id) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [selectedFault?.id]);

  useEffect(() => {
    if (!selectedFault?.id) {
      setStatusHistory([]);
      return;
    }

    const unsub = onSnapshot(
      query(
        collection(db, "faults", selectedFault.id, "statusHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setStatusHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("statusHistory listener:", err)
    );

    return () => unsub();
  }, [selectedFault?.id]);

  // Assignment history — same shape as statusHistory, reverse-
  // chronological. Subscribed unconditionally so the admin's
  // "Assign…" / "Reassign…" UI reflects writes immediately.
  useEffect(() => {
    if (!selectedFault?.id) {
      setAssignmentHistory([]);
      return;
    }

    const unsub = onSnapshot(
      query(
        collection(db, "faults", selectedFault.id, "assignmentHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setAssignmentHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("assignmentHistory listener:", err)
    );

    return () => unsub();
  }, [selectedFault?.id]);

  if (!selectedFault) {
    return (
      <div className="fault-detail-panel fault-detail-empty">
        <p>Select a fault to view details.</p>
      </div>
    );
  }

  const goToAsset = () => {
    if (!navigate) return;
    navigate({
      sidebar: "Resource Management",
      tab: "Campus Resources",
      assetId: selectedFault.resourceId
    });
  };

  // Role tier flags. Stage 4e.5 splits the maintenance domain into
  // admins (assign + override) vs staff (action only their own).
  const isMaintenanceAdmin = currentUser
    && MAINTENANCE_ADMINS.includes(currentUser.role);
  const isMaintenanceStaff = currentUser
    && currentUser.role === "Maintenance Staff";
  const isInMaintenanceDomain = currentUser
    && MAINTENANCE_ROLES.includes(currentUser.role);

  const assignedTo = selectedFault.assignedTo || null;
  const isAssignee = assignedTo
    && currentUser
    && assignedTo.uid === currentUser.uid;

  // Workflow actions are visible IF the viewer is a maintenance admin
  // (override) OR they are the current assignee. Unassigned + pending
  // faults hide the buttons entirely with a hint to claim/assign first.
  const canAct = isInMaintenanceDomain
    && (isMaintenanceAdmin || isAssignee);

  const actionsForStatus = ACTIONS_BY_STATUS[selectedFault.status] || [];
  const hasActions = actionsForStatus.length > 0;

  // Hint banner: only show on unassigned pending so the maintenance
  // viewer knows the workflow is blocked until ownership is set.
  const showUnassignedHint = !assignedTo
    && selectedFault.status === "pending"
    && isInMaintenanceDomain;

  // Assignee sub-card action button — five distinct states per spec.
  const assigneeAction = (() => {
    if (!isInMaintenanceDomain) return null;
    if (!assignedTo) {
      // Unassigned. Admin gets the dropdown modal; staff gets a one-
      // click claim.
      if (isMaintenanceAdmin) {
        return {
          key: "assign",
          label: "Assign…",
          variant: "primary",
          onClick: () => setShowAssignModal(true)
        };
      }
      if (isMaintenanceStaff) {
        return {
          key: "claim",
          label: "Claim This Fault",
          variant: "primary",
          onClick: () => setPendingAssignmentChange({ type: "claim" })
        };
      }
      return null;
    }
    // Assigned.
    if (isMaintenanceAdmin) {
      return {
        key: "reassign",
        label: "Reassign…",
        variant: "primary",
        onClick: () => setShowAssignModal(true)
      };
    }
    if (isAssignee) {
      return {
        key: "release",
        label: "Release Assignment",
        variant: "danger",
        onClick: () => setPendingAssignmentChange({ type: "release" })
      };
    }
    return null;
  })();

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

        <button
          type="button"
          className="fault-resource-link"
          onClick={goToAsset}
          title="Open this asset in Resource Management"
        >
          <strong>{selectedFault.resourceName}</strong>
          <span>{selectedFault.resourceId}</span>
        </button>

        <div className="fault-detail-pills">
          <span className={severityPillClass(selectedFault.severity)}>
            {SEVERITY_LABEL[selectedFault.severity] || selectedFault.severity}
          </span>
          <span className={statusPillClass(selectedFault.status)}>
            {STATUS_LABEL[selectedFault.status] || selectedFault.status}
          </span>
        </div>

      </div>

      {/* Assignee sub-card — shows current ownership + the contextual
          action button (Claim / Assign / Reassign / Release). Above
          the description so reviewers see ownership before details. */}
      <div className="fault-assignee-card">
        <div className="fault-assignee-body">
          {assignedTo ? (
            <>
              <div className="fault-assignee-primary">
                <span className="fault-assignee-label">Assigned to:</span>
                <strong>{assignedTo.name || "Unknown"}</strong>
                {assignedTo.role && (
                  <span className="fault-assignee-role">
                    ({assignedTo.role})
                  </span>
                )}
              </div>
              <div className="fault-assignee-sub">
                Assigned by {selectedFault.assignedBy?.name || "Unknown"}
                {selectedFault.assignedAt
                  ? ` · ${relativeTime(selectedFault.assignedAt, now)}`
                  : ""}
              </div>
            </>
          ) : (
            <div className="fault-assignee-primary">
              <span className="fault-assignee-unassigned">
                Unassigned
              </span>
            </div>
          )}
        </div>
        {assigneeAction && (
          <button
            type="button"
            className={`fault-action-btn fault-action-${assigneeAction.variant}`}
            onClick={assigneeAction.onClick}
          >
            {assigneeAction.label}
          </button>
        )}
      </div>

      <div className="fault-detail-section">
        <label>Description</label>
        <p className="fault-detail-description">
          {selectedFault.description}
        </p>
      </div>

      {selectedFault.imageUrl && (
        <div className="fault-detail-section">
          <label>Image</label>
          <a
            href={selectedFault.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="fault-detail-image-link"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedFault.imageUrl}
              alt="Fault evidence"
              className="fault-detail-image"
            />
          </a>
        </div>
      )}

      <div className="fault-detail-meta-grid">

        <div className="fault-detail-meta">
          <label>Reporter</label>
          <div>
            {selectedFault.reporterName || "—"}
            <span className="fault-detail-meta-sub">
              {selectedFault.reporterRole}
              {selectedFault.reporterDepartment
                ? ` · ${selectedFault.reporterDepartment}`
                : ""}
            </span>
          </div>
        </div>

        <div className="fault-detail-meta">
          <label>Reported</label>
          <div
            title={selectedFault.createdAt
              ? formatDate(selectedFault.createdAt)
              : ""}
          >
            {selectedFault.createdAt
              ? relativeTime(selectedFault.createdAt, now)
              : "—"}
          </div>
        </div>

      </div>

      {/* Surface the resolution notes / rejection reason inline once
          set, so a reporter checking back sees the outcome without
          having to scan the status-history list. */}
      {selectedFault.status === "resolved" && selectedFault.resolutionNotes && (
        <div className="fault-detail-section">
          <label>Resolution notes</label>
          <p className="fault-detail-description">
            {selectedFault.resolutionNotes}
          </p>
        </div>
      )}

      {selectedFault.status === "closed" && selectedFault.notes && (
        <div className="fault-detail-section">
          <label>Closure reason</label>
          <p className="fault-detail-description">
            {selectedFault.notes}
          </p>
        </div>
      )}

      <div className="fault-detail-section">
        <label>Actions</label>
        {hasActions ? (
          <>
            {showUnassignedHint && (
              <p className="fault-detail-hint">
                This fault is unassigned. Claim it or assign before actioning.
              </p>
            )}
            {!showUnassignedHint && canAct && (
              <div className="fault-actions-row">
                {actionsForStatus.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className={`fault-action-btn fault-action-${a.variant}`}
                    onClick={() => setPendingAction(a)}
                  >
                    {a.label}
                  </button>
                ))}
                {/* Stage 4e.8: maintenance can pull supplies for any
                    fault they own (or that an admin oversees). The
                    button piggybacks on canAct so the gating matches
                    the workflow buttons above. */}
                <button
                  type="button"
                  className="fault-action-btn fault-action-secondary"
                  onClick={() => setShowSupplyModal(true)}
                >
                  Request Supplies
                </button>
              </div>
            )}
            {!showUnassignedHint && !canAct && isInMaintenanceDomain && assignedTo && (
              <p className="fault-detail-hint">
                This fault is assigned to {assignedTo.name || "another staff member"}.
                {" "}Only the assignee or Maintenance Admin can action it.
              </p>
            )}
            {!isInMaintenanceDomain && (
              <p className="fault-detail-hint">
                Only maintenance staff can action this fault.
              </p>
            )}
          </>
        ) : (
          <p className="fault-detail-terminal">
            This fault is {STATUS_LABEL[selectedFault.status] || selectedFault.status}. No further actions.
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
                  <strong>
                    {STATUS_LABEL[e.newStatus] || e.newStatus}
                  </strong>
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

      <div className="fault-detail-section">
        <button
          type="button"
          className="fault-history-toggle"
          onClick={() => setShowAssignmentHistory((v) => !v)}
          aria-expanded={showAssignmentHistory}
        >
          <span>Assignment history</span>
          <span className="fault-history-toggle-chevron">
            {showAssignmentHistory ? "▾" : "▸"} {assignmentHistory.length}
          </span>
        </button>
        {showAssignmentHistory && (
          assignmentHistory.length === 0 ? (
            <p className="fault-detail-empty-text">No assignment changes yet.</p>
          ) : (
            <ul className="fault-history-list">
              {assignmentHistory.map((e) => {
                const oldName = e.oldAssignee?.name;
                const newName = e.newAssignee?.name;
                const summary = !oldName && newName
                  ? `Assigned to ${newName}`
                  : oldName && !newName
                    ? `Released from ${oldName}`
                    : oldName && newName
                      ? `Reassigned ${oldName} → ${newName}`
                      : "Assignment changed";
                return (
                  <li key={e.id} className="fault-history-item">
                    <div>
                      <strong>{summary}</strong>
                      {e.reason && (
                        <span className="fault-history-note"> · {e.reason}</span>
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
                );
              })}
            </ul>
          )
        )}
      </div>

      {/* Chat is shown to anyone with view access to the fault — same
          visibility model the rules enforce. Reporter <-> maintenance
          conversation lives here. */}
      {currentUser && (
        <FaultChat
          faultId={selectedFault.id}
          currentUser={currentUser}
        />
      )}

      {pendingAction && (
        <ActionConfirmModal
          action={pendingAction}
          faultId={selectedFault.id}
          currentUser={currentUser}
          onClose={() => setPendingAction(null)}
        />
      )}

      {showAssignModal && (
        <AssignFaultModal
          faultId={selectedFault.id}
          currentAssignee={assignedTo}
          currentUser={currentUser}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {pendingAssignmentChange && (
        <AssignmentConfirmModal
          change={pendingAssignmentChange}
          faultId={selectedFault.id}
          currentUser={currentUser}
          onClose={() => setPendingAssignmentChange(null)}
        />
      )}

      {showSupplyModal && (
        <SupplyRequestModal
          lockedFault={{
            id: selectedFault.id,
            resourceId: selectedFault.resourceId,
            resourceName: selectedFault.resourceName
          }}
          currentUser={currentUser}
          closeModal={() => setShowSupplyModal(false)}
        />
      )}

    </div>

  );
}

// ---------------------------------------------------------------
// ActionConfirmModal
//
// Single reusable confirm modal that adapts its title / blurb /
// notes-required flag based on the action config. Submits via
// updateFaultStatus and lets onSnapshot in the parent re-render the
// new status.
// ---------------------------------------------------------------

function ActionConfirmModal({ action, faultId, currentUser, onClose }) {

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = notes.trim();
  const notesValid = action.notesRequired ? trimmed.length > 0 : true;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    if (submitting) return;
    if (!notesValid) {
      setError(`${action.notesLabel} is required.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await updateFaultStatus({
        faultId,
        newStatus: action.newStatus,
        notes: trimmed,
        currentUser
      });
      onClose();
    } catch (err) {
      console.error("updateFaultStatus failed:", err);
      const code = err?.message;
      setError(
        code === "NOTES_REQUIRED"
          ? `${action.notesLabel} is required.`
          : code === "NOTES_TOO_LONG"
            ? "Notes are too long (max 2000 characters)."
            : "Could not update the fault. Please try again."
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
            <h2>{action.title}</h2>
            <p>{action.description}</p>
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
              {action.notesLabel}
              {action.notesRequired && <span style={{ color: "#b91c1c" }}> *</span>}
              <span className="fault-field-counter">{trimmed.length} / 2000</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder={
                action.notesRequired
                  ? "Required — describe what was done or why this is being closed."
                  : "Optional — add context for the reporter."
              }
              disabled={submitting}
              autoFocus
            />
          </div>

          {error && (
            <div className="fault-error-banner" role="alert">
              {error}
            </div>
          )}

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
              className={`fault-submit-btn fault-submit-${action.variant}`}
              disabled={submitting || !notesValid}
            >
              {submitting ? "Saving…" : action.submitLabel}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// AssignmentConfirmModal (Stage 4e.5)
//
// Handles the two single-button assignment changes that don't need
// the full staff-picker AssignFaultModal:
//   - claim:   staff self-assigns. Reason auto-supplied so the service
//              gets its required 5-char minimum. Confirm-only UX.
//   - release: assignee drops the fault. Reason required from the
//              actor — they have to justify dropping ownership.
// ---------------------------------------------------------------

function AssignmentConfirmModal({ change, faultId, currentUser, onClose }) {

  const isClaim = change.type === "claim";

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = reason.trim();
  const reasonValid = isClaim
    ? true
    : trimmed.length >= 5 && trimmed.length <= 500;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    if (!reasonValid) {
      setError("Reason must be 5–500 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isClaim) {
        await assignFault({
          faultId,
          newAssignee: {
            uid: currentUser.uid,
            name: currentUser.fullName || currentUser.email || "Unknown",
            role: currentUser.role
          },
          reason: trimmed || `Self-claimed by ${currentUser.fullName || currentUser.email}`,
          currentUser
        });
      } else {
        await assignFault({
          faultId,
          newAssignee: null,
          reason: trimmed,
          currentUser
        });
      }
      onClose();
    } catch (err) {
      console.error("assignFault failed:", err);
      const code = err?.message;
      setError(
        code === "REASON_TOO_SHORT"
          ? "Reason must be at least 5 characters."
          : code === "REASON_TOO_LONG"
            ? "Reason must be at most 500 characters."
            : "Could not update the assignment. Please try again."
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
            <h2>{isClaim ? "Claim this fault" : "Release assignment"}</h2>
            <p>
              {isClaim
                ? "You'll become the owner and can transition this fault through its workflow."
                : "Drop your ownership of this fault. A maintenance admin will need to reassign it."}
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
            <label>
              {isClaim ? "Note (optional)" : "Reason"}
              {!isClaim && <span style={{ color: "#b91c1c" }}> *</span>}
              <span className="fault-field-counter">{trimmed.length} / 500</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder={
                isClaim
                  ? "Optional — add context for the audit log."
                  : "Required — why are you releasing this fault?"
              }
              disabled={submitting}
              autoFocus
            />
          </div>

          {error && (
            <div className="fault-error-banner" role="alert">
              {error}
            </div>
          )}

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
              className={`fault-submit-btn fault-submit-${isClaim ? "primary" : "danger"}`}
              disabled={submitting || !reasonValid}
            >
              {submitting
                ? "Saving…"
                : (isClaim ? "Claim fault" : "Release fault")}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
