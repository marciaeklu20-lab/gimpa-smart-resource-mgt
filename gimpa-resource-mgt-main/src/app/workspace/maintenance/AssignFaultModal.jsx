"use client";

import { useEffect, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

import { assignFault } from "./services/assignFault";

const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

// One-shot fetch — the staff list is short and the modal opens
// infrequently. A live subscription would be overkill. If a user is
// added mid-session, closing and reopening the modal will pick them up.
export default function AssignFaultModal({
  faultId,
  currentAssignee,
  currentUser,
  onClose
}) {

  const db = getFirestore(app);

  const [staffOptions, setStaffOptions] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedUid, setSelectedUid] = useState(
    currentAssignee?.uid || ""
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("role", "==", "Maintenance Staff"),
            where("approved", "==", true)
          )
        );
        const options = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .sort((a, b) =>
            (a.fullName || "").localeCompare(b.fullName || "")
          );
        setStaffOptions(options);
      } catch (e) {
        console.error("Failed to load maintenance staff:", e);
        setError("Could not load maintenance staff list.");
      } finally {
        setLoadingStaff(false);
      }
    };
    load();
  }, []);

  const trimmedReason = reason.trim();
  const reasonValid =
    trimmedReason.length >= MIN_REASON_LENGTH
    && trimmedReason.length <= MAX_REASON_LENGTH;
  const selectionValid = selectedUid.length > 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;

    if (!selectionValid) {
      setError("Choose a staff member to assign.");
      return;
    }

    if (!reasonValid) {
      setError(
        trimmedReason.length < MIN_REASON_LENGTH
          ? `Reason must be at least ${MIN_REASON_LENGTH} characters.`
          : `Reason must be at most ${MAX_REASON_LENGTH} characters.`
      );
      return;
    }

    const target = staffOptions.find((s) => s.uid === selectedUid);
    if (!target) {
      setError("Selected staff member is no longer available.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await assignFault({
        faultId,
        newAssignee: {
          uid: target.uid,
          name: target.fullName || target.email || "Unknown",
          role: target.role
        },
        reason: trimmedReason,
        currentUser
      });
      onClose();
    } catch (err) {
      console.error("assignFault failed:", err);
      const code = err?.message;
      setError(
        code === "REASON_TOO_SHORT"
          ? `Reason must be at least ${MIN_REASON_LENGTH} characters.`
          : code === "REASON_TOO_LONG"
            ? `Reason must be at most ${MAX_REASON_LENGTH} characters.`
            : "Could not assign the fault. Please try again."
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
            <h2>
              {currentAssignee ? "Reassign fault" : "Assign fault"}
            </h2>
            <p>
              {currentAssignee
                ? `Currently assigned to ${currentAssignee.name}. Choose a new owner and explain why.`
                : "Choose a maintenance staff member to own this fault."}
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
            <label htmlFor="assign-fault-staff">
              Assign to
              <span style={{ color: "#b91c1c" }}> *</span>
            </label>
            <select
              id="assign-fault-staff"
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
              disabled={loadingStaff || submitting}
              required
            >
              <option value="">
                {loadingStaff
                  ? "Loading maintenance staff…"
                  : "-- Select staff member --"}
              </option>
              {staffOptions.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.fullName || s.email}
                </option>
              ))}
            </select>
            {!loadingStaff && staffOptions.length === 0 && (
              <p className="fault-detail-empty-text" style={{ marginTop: 8 }}>
                No approved Maintenance Staff found.
              </p>
            )}
          </div>

          <div className="fault-field">
            <label htmlFor="assign-fault-reason">
              Reason
              <span style={{ color: "#b91c1c" }}> *</span>
              <span className="fault-field-counter">
                {trimmedReason.length} / {MAX_REASON_LENGTH}
              </span>
            </label>
            <textarea
              id="assign-fault-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REASON_LENGTH}
              placeholder="Required — why are you assigning this fault to this person?"
              disabled={submitting}
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
              className="fault-submit-btn fault-submit-primary"
              disabled={
                submitting
                || loadingStaff
                || !selectionValid
                || !reasonValid
              }
            >
              {submitting
                ? "Saving…"
                : (currentAssignee ? "Reassign" : "Assign")}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
