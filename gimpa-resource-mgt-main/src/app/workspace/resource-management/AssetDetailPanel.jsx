"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  isBookable,
  lifecycleLabel,
  conditionLabel,
  lifecyclePillStyle,
  conditionPillStyle,
  formatLocation,
  formatCurrency,
  formatDate,
  formatWarrantyStatus,
  relativeTime
} from "@/app/lib/resourceMeta";

import { canBookResource } from "./services/permissions";
import { responsibleRoleForCategory } from "@/app/lib/categoryResponsibility";

import BookingForm from "./BookingForm";

// Lazy-load the fault-report modal — pulls in the firebase/storage
// SDK + the rest of the maintenance subtree, which would bloat the
// AssetDetailPanel chunk. We only need it when the user clicks the
// Report Fault button, so dynamic() with ssr:false is the right tool.
const ReportFaultModal = dynamic(
  () => import("@/app/workspace/maintenance/ReportFaultModal"),
  { ssr: false }
);

// Stage 4f: detect a conditionHistory entry written by the resolve flow
// so its reason "Resolved from fault: <faultId>" can render as a
// clickable navigation back into Maintenance. updateFaultStatus.js
// owns the exact string format; keep these in sync.
const RESOLVED_FROM_FAULT_RE = /^Resolved from fault:\s*(\S+)$/;

const parseResolvedFromFault = (reason) => {
  if (typeof reason !== "string") return null;
  const m = reason.match(RESOLVED_FROM_FAULT_RE);
  return m ? m[1] : null;
};

export default function AssetDetailPanel({
  selectedAsset,
  currentUserRole,
  currentUser,
  navigate,
  onClose
}) {

  const db = getFirestore(app);

  const [conditionHistory, setConditionHistory] = useState([]);
  const [lifecycleHistory, setLifecycleHistory] = useState([]);
  const [custodianHistory, setCustodianHistory] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-render every 30s so the relative-time strings (conditionHistory
  // entries, custodianAssignedAt, etc.) stay current without a refetch.
  useEffect(() => {
    if (!selectedAsset?.id) return;
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, [selectedAsset?.id]);

  // Subscribes to the three history subcollections and the bookings
  // collection. All four unsubscribes are torn down on asset change /
  // unmount so we don't leak listeners when the user clicks through
  // many assets in a row.
  useEffect(() => {

    if (!selectedAsset?.id) {
      setConditionHistory([]);
      setLifecycleHistory([]);
      setCustodianHistory([]);
      setBookings([]);
      return;
    }

    const id = selectedAsset.id;
    const unsubs = [];

    unsubs.push(onSnapshot(
      query(
        collection(db, "resources", id, "conditionHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setConditionHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("conditionHistory listener:", err)
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, "resources", id, "lifecycleHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setLifecycleHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("lifecycleHistory listener:", err)
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, "resources", id, "custodianHistory"),
        orderBy("changedAt", "desc")
      ),
      (snap) => setCustodianHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("custodianHistory listener:", err)
    ));

    unsubs.push(onSnapshot(
      query(
        collection(db, "bookings"),
        where("resourceId", "==", id),
        orderBy("createdAt", "desc"),
        limit(10)
      ),
      (snap) => setBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("bookings listener:", err)
    ));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [selectedAsset?.id]);

  if (!selectedAsset) {
    return (
      <div className="asset-detail-panel asset-detail-empty">
        <p>Select an asset to view details</p>
      </div>
    );
  }

  const status = selectedAsset.lifecycleStatus || "active";
  const condition = selectedAsset.condition || "good";
  const warranty = formatWarrantyStatus(selectedAsset.warrantyExpiry, now);

  return (
    <>
      <div className="asset-detail-panel">

        {onClose && (
          <button
            type="button"
            className="asset-detail-close"
            onClick={onClose}
            aria-label="Close detail panel"
          >
            ×
          </button>
        )}

        <div className="asset-detail-header">
          <h2 className="asset-detail-name">
            {selectedAsset.resourceName}
          </h2>
          <div className="asset-detail-pills">
            <span className={`pill ${lifecyclePillStyle(status)}`}>
              {lifecycleLabel(status)}
            </span>
            <span className={`pill ${conditionPillStyle(condition)}`}>
              {conditionLabel(condition)}
            </span>
          </div>
          <div className="asset-detail-code">
            {selectedAsset.assetCode}
          </div>
        </div>

        {canBookResource(currentUserRole) && isBookable(selectedAsset) && (
          <button
            type="button"
            className="book-resource-btn asset-detail-book-btn"
            onClick={() => setShowBookingForm(true)}
          >
            Book Resource
          </button>
        )}

        {/* Report Fault — open to ANY signed-in user (Stage 4d). The
            modal opens with the current asset pre-selected + locked. */}
        {currentUser && (
          <button
            type="button"
            className="asset-detail-report-fault-btn"
            onClick={() => setShowFaultModal(true)}
          >
            Report Fault on this asset
          </button>
        )}

        <div className="asset-detail-fields">

          {/* Stage 4e.7: who owns this resource for additions, edits,
              and booking-approval routing. Prefer the persisted
              responsibleRole; fall back to deriving from category for
              pre-4e.7 records. */}
          <div className="asset-detail-field">
            <label>Managed by</label>
            <div>
              {selectedAsset.responsibleRole
                || responsibleRoleForCategory(selectedAsset.category)
                || "—"}
            </div>
          </div>

          <div className="asset-detail-field">
            <label>Location</label>
            <div>{formatLocation(selectedAsset.location)}</div>
          </div>

          {selectedAsset.category === "Facilities" ? (
            <div className="asset-detail-field">
              <label>Capacity</label>
              <div>{selectedAsset.capacity || "—"}</div>
            </div>
          ) : (
            <div className="asset-detail-field">
              <label>Quantity</label>
              <div>{selectedAsset.quantity || "—"}</div>
            </div>
          )}

          <div className="asset-detail-field">
            <label>Custodian</label>
            <div>
              {selectedAsset.custodianName || "Unassigned"}
              {selectedAsset.custodianAssignedAt && (
                <span className="asset-detail-meta">
                  {" — assigned "}
                  {relativeTime(selectedAsset.custodianAssignedAt, now)}
                </span>
              )}
            </div>
          </div>

          <div className="asset-detail-field">
            <label>Vendor</label>
            <div>{selectedAsset.vendor || "—"}</div>
          </div>

          <div className="asset-detail-field">
            <label>Acquisition</label>
            <div>
              {formatDate(selectedAsset.acquisitionDate)}
              {selectedAsset.acquisitionCost != null && (
                <span className="asset-detail-meta">
                  {" — "}{formatCurrency(selectedAsset.acquisitionCost)}
                </span>
              )}
            </div>
          </div>

          <div className="asset-detail-field">
            <label>Warranty</label>
            <div className={warranty.expired ? "warranty-expired" : ""}>
              {warranty.label}
            </div>
          </div>

        </div>

        <div className="asset-detail-history">

          <HistorySection
            title="Condition History"
            entries={conditionHistory}
            now={now}
            renderEntry={(e) => {
              const faultId = parseResolvedFromFault(e.reason);
              return (
                <>
                  {e.oldCondition ? `${conditionLabel(e.oldCondition)} → ` : ""}
                  <strong>{conditionLabel(e.newCondition)}</strong>
                  {e.reason && (
                    faultId ? (
                      <>
                        <span className="history-reason"> · Resolved from fault: </span>
                        <button
                          type="button"
                          className="history-fault-link"
                          onClick={() => navigate && navigate({ faultId })}
                          title="Open this fault in Maintenance"
                        >
                          {faultId.slice(0, 8)}
                        </button>
                      </>
                    ) : (
                      <span className="history-reason"> · {e.reason}</span>
                    )
                  )}
                </>
              );
            }}
          />

          <HistorySection
            title="Lifecycle History"
            entries={lifecycleHistory}
            now={now}
            renderEntry={(e) => (
              <>
                {e.oldStatus ? `${lifecycleLabel(e.oldStatus)} → ` : ""}
                <strong>{lifecycleLabel(e.newStatus)}</strong>
                {e.reason && (
                  <span className="history-reason"> · {e.reason}</span>
                )}
              </>
            )}
          />

          <HistorySection
            title="Custodian History"
            entries={custodianHistory}
            now={now}
            renderEntry={(e) => (
              <>
                <strong>
                  {e.oldCustodianId ? "Reassigned" : "Assigned"}
                </strong>
                {e.reason && (
                  <span className="history-reason"> · {e.reason}</span>
                )}
              </>
            )}
          />

          <HistorySection
            title="Bookings on this asset"
            entries={bookings}
            timestampField="createdAt"
            now={now}
            emptyText="No bookings yet"
            renderEntry={(b) => (
              <>
                <strong>{b.purpose || "Booking"}</strong>
                <span className="history-reason">
                  {" · "}{b.requesterName || b.requesterEmail || "Unknown"}
                </span>
                <span className={`pill pill-inline pill-${b.status}`}>
                  {b.status}
                </span>
              </>
            )}
          />

        </div>

      </div>

      {showBookingForm && (
        <BookingForm
          resource={selectedAsset}
          closeModal={() => setShowBookingForm(false)}
        />
      )}

      {showFaultModal && (
        <ReportFaultModal
          lockedResource={selectedAsset}
          currentUser={currentUser}
          closeModal={() => setShowFaultModal(false)}
        />
      )}
    </>
  );
}

function HistorySection({
  title,
  entries,
  renderEntry,
  now,
  timestampField = "changedAt",
  emptyText = "No entries"
}) {
  return (
    <div className="history-section">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="history-empty">{emptyText}</p>
      ) : (
        <ul className="history-list">
          {entries.map((e) => (
            <li key={e.id} className="history-item">
              <div className="history-content">{renderEntry(e)}</div>
              <div className="history-time">
                {e[timestampField]
                  ? relativeTime(e[timestampField], now)
                  : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
