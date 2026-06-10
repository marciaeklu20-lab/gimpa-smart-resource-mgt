"use client";

// Stage 7 — Profile modal, opened from the Header ProfileMenu dropdown.
// Read-only display of the signed-in user's account fields, plus an
// editable fullName. Save writes only fullName (updateDoc), then asks
// the parent to refresh the cached user doc and closes.
//
// Fields are read from the currentUser prop (the same { uid, ...doc }
// shape page.jsx already holds) — no new auth-data-fetch pattern.

import React, { useState } from "react";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import app from "@/firebase/config";
import { LuX } from "react-icons/lu";

import "@/app/styles/workspace/profile.css";

const db = getFirestore(app);

const formatDate = (value) => {
  if (!value) return "—";
  // Firestore Timestamp (has toDate) or ISO string / Date.
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
};

export default function Profile({ currentUser, onClose, onSaved }) {

  const [fullName, setFullName] = useState(currentUser?.fullName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const idLabel = currentUser?.studentID ? "Student ID" : "Staff ID";
  const idValue = currentUser?.studentID || currentUser?.staffID || "—";

  const trimmed = fullName.trim();
  const dirty = trimmed && trimmed !== (currentUser?.fullName || "");

  const handleSave = async () => {
    if (saving || !dirty) return;
    setError(null);
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { fullName: trimmed });
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      console.error("[Profile] save failed:", err);
      setError("Couldn't save your name. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="profile-modal-header">
          <h2>Profile</h2>
          <button
            type="button"
            className="profile-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <LuX size={20} />
          </button>
        </div>

        <div className="profile-modal-body">

          <label className="profile-field profile-field-editable">
            <span className="profile-field-label">Full name</span>
            <input
              type="text"
              className="profile-field-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </label>

          <div className="profile-field">
            <span className="profile-field-label">Email</span>
            <span className="profile-field-value">{currentUser?.email || "—"}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Role</span>
            <span className="profile-field-value">{currentUser?.role || "—"}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Department</span>
            <span className="profile-field-value">{currentUser?.department || "—"}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">{idLabel}</span>
            <span className="profile-field-value">{idValue}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Joined</span>
            <span className="profile-field-value">{formatDate(currentUser?.createdAt)}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Status</span>
            <span className="profile-field-value">
              {currentUser?.approved ? "Approved" : "Pending approval"}
            </span>
          </div>

          {error && <p className="profile-modal-error">{error}</p>}

        </div>

        <div className="profile-modal-footer">
          <button
            type="button"
            className="profile-modal-btn profile-modal-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="profile-modal-btn profile-modal-btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

      </div>
    </div>
  );
}
