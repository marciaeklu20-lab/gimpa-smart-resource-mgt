"use client";

import { useEffect, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { relativeTime, formatDate } from "@/app/lib/resourceMeta";

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
  rejected:     "Rejected"
};

const severityPillClass = (s) => `fault-pill fault-severity-${s || "minor"}`;
const statusPillClass   = (s) => `fault-pill fault-status-${s || "pending"}`;

export default function FaultDetailPanel({
  selectedFault,
  navigate,
  onClose
}) {

  const db = getFirestore(app);

  const [statusHistory, setStatusHistory] = useState([]);
  const [now, setNow] = useState(() => Date.now());

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

      <div className="fault-detail-section fault-detail-actions-placeholder">
        <label>Actions</label>
        <p>Workflow actions (acknowledge, in progress, resolve) coming in the next update.</p>
      </div>

    </div>

  );
}
