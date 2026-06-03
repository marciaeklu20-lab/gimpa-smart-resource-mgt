"use client";

import { useEffect, useMemo, useState } from "react";

import { IoCloseOutline } from "react-icons/io5";
import { FaTimes, FaImage } from "react-icons/fa";

import {
  createFault,
  SEVERITY_OPTIONS,
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MAX_IMAGE_BYTES
} from "./services/createFault";

const ERROR_MESSAGES = {
  RESOURCE_REQUIRED: "Please select an asset.",
  USER_REQUIRED: "You must be signed in to report a fault.",
  SEVERITY_INVALID: "Please choose a severity.",
  DESCRIPTION_TOO_SHORT: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters.`,
  DESCRIPTION_TOO_LONG: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
  IMAGE_TOO_LARGE: "Image must be smaller than 10 MB.",
  IMAGE_INVALID_TYPE: "Please choose an image file (JPEG, PNG, GIF, WebP)."
};

export default function ReportFaultModal({
  closeModal,
  lockedResource,
  allResources = [],
  currentUser
}) {

  const [selectedResourceId, setSelectedResourceId] = useState(
    lockedResource?.assetCode || lockedResource?.id || ""
  );
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Build a sorted resource list ONCE per props change so the dropdown
  // is deterministic.
  const sortedResources = useMemo(() => {
    return [...allResources].sort((a, b) =>
      (a.resourceName || "").localeCompare(b.resourceName || "")
    );
  }, [allResources]);

  // Image preview lifecycle — create on file select, revoke on
  // change/unmount to avoid leaking blob URLs.
  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const resource = lockedResource
    ? lockedResource
    : sortedResources.find(
        (r) => (r.assetCode || r.id) === selectedResourceId
      );

  const trimmedDescription = description.trim();
  const charsLeft = MAX_DESCRIPTION_LENGTH - description.length;

  const canSubmit =
    !submitting
    && !!resource
    && trimmedDescription.length >= MIN_DESCRIPTION_LENGTH
    && trimmedDescription.length <= MAX_DESCRIPTION_LENGTH;

  const onImageChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setImageFile(null);
      return;
    }
    // Validate up front so the user gets an immediate signal instead
    // of finding out only at submit.
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(ERROR_MESSAGES.IMAGE_TOO_LARGE);
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setErrorMessage(ERROR_MESSAGES.IMAGE_INVALID_TYPE);
      e.target.value = "";
      return;
    }
    setErrorMessage(null);
    setImageFile(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setUploadProgress(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);
    setUploadProgress(0);

    try {
      await createFault({
        resource,
        description: trimmedDescription,
        severity,
        imageFile,
        currentUser,
        onProgress: setUploadProgress
      });

      // Mirror the codebase's existing booking-success pattern (alert)
      // since there's no toast component yet — see PR notes for Stage
      // 4d. Acceptable while we ship the feature.
      alert("Fault reported. Maintenance Staff have been notified.");
      closeModal();

    } catch (err) {
      console.error("createFault failed:", err);
      const code = err?.message;
      setErrorMessage(
        ERROR_MESSAGES[code]
        || "Failed to submit fault. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (

    <div className="fault-modal-overlay">

      <div className="fault-modal">

        <div className="fault-modal-header">
          <div>
            <h2>Report a fault</h2>
            <p>
              Let Maintenance know what's wrong with this asset.
            </p>
          </div>
          <button
            type="button"
            className="fault-modal-close"
            onClick={closeModal}
            aria-label="Close"
          >
            <IoCloseOutline size={28} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="fault-modal-form">

          <div className="fault-field">
            <label>Asset</label>
            {lockedResource ? (
              <div className="fault-locked-resource">
                <strong>{lockedResource.resourceName}</strong>
                <span>{lockedResource.assetCode}</span>
              </div>
            ) : (
              <select
                value={selectedResourceId}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                required
              >
                <option value="">Select an asset…</option>
                {sortedResources.map((r) => (
                  <option
                    key={r.assetCode || r.id}
                    value={r.assetCode || r.id}
                  >
                    {(r.resourceName || "Unnamed")} — {r.assetCode || r.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="fault-field">
            <label>Severity</label>
            <div className="fault-severity-grid">
              {SEVERITY_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className={`fault-severity-option ${severity === s.value ? "active" : ""}`}
                  title={s.hint}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={s.value}
                    checked={severity === s.value}
                    onChange={() => setSeverity(s.value)}
                  />
                  <span className="fault-severity-label">{s.label}</span>
                  <span className="fault-severity-hint">{s.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="fault-field">
            <label>
              Description
              <span className="fault-field-counter">
                {trimmedDescription.length} / {MAX_DESCRIPTION_LENGTH}
              </span>
            </label>
            <textarea
              placeholder="Describe what's wrong. The more context Maintenance Staff have, the faster they can act."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION_LENGTH}
              required
            />
            {trimmedDescription.length > 0
              && trimmedDescription.length < MIN_DESCRIPTION_LENGTH && (
              <p className="fault-field-hint warn">
                At least {MIN_DESCRIPTION_LENGTH} characters needed.
              </p>
            )}
          </div>

          <div className="fault-field">
            <label>
              <FaImage style={{ marginRight: 6 }} />
              Image (optional, max 10 MB)
            </label>

            {imagePreviewUrl ? (
              <div className="fault-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreviewUrl} alt="Selected fault evidence" />
                <button
                  type="button"
                  className="fault-image-remove"
                  onClick={removeImage}
                  aria-label="Remove image"
                >
                  <FaTimes /> Remove
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={onImageChange}
              />
            )}

            {submitting && imageFile && uploadProgress > 0 && (
              <div className="fault-upload-progress">
                <div
                  className="fault-upload-progress-bar"
                  style={{ width: `${uploadProgress}%` }}
                />
                <span>{uploadProgress}%</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="fault-error-banner">{errorMessage}</div>
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
              {submitting ? "Submitting…" : "Submit fault report"}
            </button>
          </div>

        </form>

      </div>

    </div>

  );
}
