"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  transferAsset,
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH
} from "./services/transferAsset";

const db = getFirestore(app);

// Roles excluded from the custodian picker. Per spec: physical-asset
// custody is staff-side only, faculty and students don't carry it.
// We also drop the student variants (studentType-derived roles) so
// the picker never lists General Students / Course Reps.
const EXCLUDED_PICKER_ROLES = new Set([
  "student",
  "Lecturer",
  "General Student",
  "Course Rep",
  "Teaching Assistant"
]);

// Pull the live location object off a resource doc into the 4-field
// shape the form binds to. Tolerant of legacy resources that store
// location as null or a partial object.
const locationToForm = (loc) => ({
  campus:   loc?.campus   || "",
  building: loc?.building || "",
  floor:    loc?.floor    || "",
  room:     loc?.room     || ""
});

// "Block A › Floor 1 › Room 101" — used for the current/old/new
// location summary. Empty parts are dropped so the breadcrumb reads
// cleanly even with partial location data.
const summarizeLocation = (loc) => {
  if (!loc) return "—";
  const parts = [loc.campus, loc.building, loc.floor, loc.room]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" › ") : "—";
};

export default function TransferAssetModal({
  asset,
  currentUser,
  onClose,
  onTransferred
}) {

  const [staffOptions, setStaffOptions] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  // null = "no change"; "" = "Set to Unassigned"; any other string =
  // selected staff uid.
  const [selectedCustodianId, setSelectedCustodianId] = useState(null);

  const initialLocation = useMemo(() => locationToForm(asset?.location), [asset?.id]);
  const [campus, setCampus] = useState(initialLocation.campus);
  const [building, setBuilding] = useState(initialLocation.building);
  const [floor, setFloor] = useState(initialLocation.floor);
  const [room, setRoom] = useState(initialLocation.room);

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load eligible custodians once on mount. The query mirrors
  // AddResourceForm: approved staff with an @gimpa.edu.gh email.
  // Excluded-role filter narrows further per Stage 4h spec.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("approved", "==", true)
          )
        );
        const staff = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u) =>
            typeof u.email === "string"
            && u.email.endsWith("@gimpa.edu.gh")
            && !EXCLUDED_PICKER_ROLES.has(u.role)
          )
          .sort((a, b) =>
            (a.fullName || a.email || "").localeCompare(
              b.fullName || b.email || ""
            )
          );
        if (!cancelled) setStaffOptions(staff);
      } catch (err) {
        console.error("TransferAssetModal staff load failed:", err);
        if (!cancelled) {
          setError("Could not load the staff picker. You may not have permission.");
        }
      } finally {
        if (!cancelled) setLoadingStaff(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const currentCustodianId = asset?.custodianId || null;
  const currentCustodianName = asset?.custodianName || null;
  const isCurrentCustodian =
    !!currentCustodianId && currentCustodianId === currentUser?.uid;

  // Compute next-state custodian. null when picker hasn't been touched
  // (treat as "no change"); resolved staff record when an id is
  // selected; explicit null with intent when "Unassigned" picked.
  const pickerStaff = useMemo(() => {
    if (selectedCustodianId === null) return undefined; // no change
    if (selectedCustodianId === "") return null;        // unassigned
    return staffOptions.find((s) => s.uid === selectedCustodianId) || undefined;
  }, [selectedCustodianId, staffOptions]);

  const custodianWouldChange = (() => {
    if (pickerStaff === undefined) return false;
    const nextUid = pickerStaff?.uid || null;
    return nextUid !== currentCustodianId;
  })();

  // Location delta vs the asset's current value. trim() to be tolerant
  // of pure-whitespace edits.
  const formLocation = useMemo(() => ({
    campus: campus.trim(),
    building: building.trim(),
    floor: floor.trim(),
    room: room.trim()
  }), [campus, building, floor, room]);

  const locationWouldChange = (
    formLocation.campus   !== (initialLocation.campus   || "")
    || formLocation.building !== (initialLocation.building || "")
    || formLocation.floor    !== (initialLocation.floor    || "")
    || formLocation.room     !== (initialLocation.room     || "")
  );

  const trimmedReason = reason.trim();
  const reasonValid =
    trimmedReason.length >= MIN_REASON_LENGTH
    && trimmedReason.length <= MAX_REASON_LENGTH;

  const hasChange = custodianWouldChange || locationWouldChange;

  const canSubmit =
    !submitting
    && hasChange
    && reasonValid
    && !isCurrentCustodian;

  const resetLocation = () => {
    setCampus(initialLocation.campus);
    setBuilding(initialLocation.building);
    setFloor(initialLocation.floor);
    setRoom(initialLocation.room);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    // Resolve the custodian payload for the service. undefined means
    // "no change" — we let custodianChanged stay false by passing the
    // existing id back. null means unassigned. Otherwise pass {uid,name}.
    let custodianPayload;
    if (pickerStaff === undefined) {
      custodianPayload = currentCustodianId
        ? { uid: currentCustodianId, name: currentCustodianName }
        : null;
    } else if (pickerStaff === null) {
      custodianPayload = null;
    } else {
      custodianPayload = {
        uid: pickerStaff.uid,
        name: pickerStaff.fullName || pickerStaff.email || "Unknown"
      };
    }

    const locationPayload = locationWouldChange
      ? formLocation
      : (asset?.location || null);

    try {
      await transferAsset({
        resourceId: asset.id || asset.assetCode,
        newCustodian: custodianPayload,
        newLocation: locationPayload,
        reason: trimmedReason,
        currentUser
      });
      onTransferred?.();
      onClose?.();
    } catch (err) {
      console.error("transferAsset failed:", err);
      const code = err?.message;
      setError(
        code === "REASON_TOO_SHORT"
          ? `Reason must be at least ${MIN_REASON_LENGTH} characters.`
          : code === "REASON_TOO_LONG"
            ? `Reason cannot exceed ${MAX_REASON_LENGTH} characters.`
            : code === "NO_CHANGES"
              ? "Select at least one change — custodian or location."
              : code === "CANNOT_TRANSFER_OWN_ASSET"
                ? "You cannot transfer an asset you currently custody."
                : code === "RESOURCE_NOT_FOUND"
                  ? "Asset not found."
                  : "Could not transfer the asset. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!asset) return null;

  return (
    <div className="transfer-overlay" role="dialog" aria-modal="true">
      <div className="transfer-modal">

        <div className="transfer-modal-header">
          <div>
            <h2>Transfer asset: {asset.resourceName}</h2>
            <p>{asset.assetCode}</p>
          </div>
          <button
            type="button"
            className="transfer-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="transfer-modal-form" onSubmit={handleSubmit}>

          {/* Custodian section */}
          <section className="transfer-section">
            <h3>Custodian</h3>
            <div className="transfer-current">
              Current: <strong>{currentCustodianName || "Unassigned"}</strong>
            </div>
            <div className="transfer-field">
              <label htmlFor="transfer-custodian">New custodian</label>
              <select
                id="transfer-custodian"
                value={selectedCustodianId ?? "__nochange__"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__nochange__") setSelectedCustodianId(null);
                  else setSelectedCustodianId(v);
                }}
                disabled={submitting || loadingStaff}
              >
                <option value="__nochange__">(no change)</option>
                <option value="">Set to Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.uid} value={s.uid}>
                    {s.fullName || s.email}
                    {s.role ? ` — ${s.role}` : ""}
                  </option>
                ))}
              </select>
              {loadingStaff && (
                <p className="transfer-hint">Loading staff…</p>
              )}
            </div>
          </section>

          {/* Location section */}
          <section className="transfer-section">
            <div className="transfer-section-header">
              <h3>Location</h3>
              {locationWouldChange && (
                <button
                  type="button"
                  className="transfer-reset-link"
                  onClick={resetLocation}
                  disabled={submitting}
                >
                  Reset to current
                </button>
              )}
            </div>
            <div className="transfer-current">
              Current: <strong>{summarizeLocation(asset.location)}</strong>
            </div>
            <div className="transfer-location-grid">
              <div className="transfer-field">
                <label htmlFor="transfer-campus">Campus</label>
                <input
                  id="transfer-campus"
                  type="text"
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                  disabled={submitting}
                  placeholder="Main Campus"
                />
              </div>
              <div className="transfer-field">
                <label htmlFor="transfer-building">Building</label>
                <input
                  id="transfer-building"
                  type="text"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  disabled={submitting}
                  placeholder="GIMPA Block A"
                />
              </div>
              <div className="transfer-field">
                <label htmlFor="transfer-floor">Floor</label>
                <input
                  id="transfer-floor"
                  type="text"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  disabled={submitting}
                  placeholder="Floor 1"
                />
              </div>
              <div className="transfer-field">
                <label htmlFor="transfer-room">Room</label>
                <input
                  id="transfer-room"
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  disabled={submitting}
                  placeholder="Room 101"
                />
              </div>
            </div>
          </section>

          {/* Reason section */}
          <section className="transfer-section">
            <h3>Reason</h3>
            <div className="transfer-field">
              <label htmlFor="transfer-reason">
                Reason
                <span style={{ color: "#b91c1c" }}> *</span>
                <span className="transfer-field-counter">
                  {trimmedReason.length} / {MAX_REASON_LENGTH}
                </span>
              </label>
              <textarea
                id="transfer-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={MAX_REASON_LENGTH}
                rows={3}
                placeholder="e.g., Reassigning to the Engineering department following the equipment review on…"
                disabled={submitting}
              />
              {trimmedReason.length > 0
                && trimmedReason.length < MIN_REASON_LENGTH && (
                <p className="transfer-hint transfer-hint-warn">
                  Reason must be at least {MIN_REASON_LENGTH} characters.
                </p>
              )}
            </div>
          </section>

          {/* Inline validation banner — shows the blocking reason
              when the submit button is disabled. Errors from the
              service surface separately below. */}
          {!hasChange && (
            <div className="transfer-validation">
              Select at least one change — custodian or location.
            </div>
          )}
          {isCurrentCustodian && (
            <div className="transfer-validation transfer-validation-error">
              You cannot transfer an asset you currently custody.
            </div>
          )}

          {error && (
            <div className="transfer-error" role="alert">{error}</div>
          )}

          <div className="transfer-modal-actions">
            <button
              type="button"
              className="transfer-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="transfer-submit-btn"
              disabled={!canSubmit}
            >
              {submitting ? "Transferring…" : "Transfer asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
