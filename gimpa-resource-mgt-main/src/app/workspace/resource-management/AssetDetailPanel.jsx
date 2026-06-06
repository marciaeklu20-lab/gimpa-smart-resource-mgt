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

import { PLATFORM_ADMINS, RESOURCE_MANAGERS } from "@/app/lib/roles";

import BookingForm from "./BookingForm";
import QrCodeButton from "./qrCode/QrCodeButton";

// Stage 4h: lazy — TransferAssetModal pulls the staff picker + writeBatch
// service when first opened. Keeps the AssetDetailPanel chunk lean for
// viewers who never trigger a transfer.
const TransferAssetModal = dynamic(
  () => import("./TransferAssetModal"),
  { ssr: false }
);

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
  const [transfers, setTransfers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
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
      setTransfers([]);
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

    // Stage 4h: transfers — first-class events that flip custodian
    // and/or location with reason + actor. Distinct from the
    // initial-registration custodianHistory entries above.
    unsubs.push(onSnapshot(
      query(
        collection(db, "resources", id, "transfers"),
        orderBy("transferredAt", "desc")
      ),
      (snap) => setTransfers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("transfers listener:", err)
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

  // Stage 4h: gate the Transfer button. PLATFORM_ADMINS can transfer
  // anything; RESOURCE_MANAGERS only within their responsibleRole
  // slice. Separation of duties applies to everyone: the current
  // custodian cannot transfer the asset they hold (even admins).
  const isCurrentCustodian =
    !!selectedAsset.custodianId
    && selectedAsset.custodianId === currentUser?.uid;
  const canTransferAsset =
    !!currentUserRole
    && !isCurrentCustodian
    && (
      PLATFORM_ADMINS.includes(currentUserRole)
      || (
        RESOURCE_MANAGERS.includes(currentUserRole)
        && selectedAsset.responsibleRole === currentUserRole
      )
    );

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

          {/* Stage 4k: QR code — encodes the public /r/<assetCode> scan
              URL. Lazy-loads the modal + qrcode.react on first click. */}
          <QrCodeButton resource={selectedAsset} />
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

        {/* Stage 4h: Transfer Asset — gated by role + responsibleRole +
            separation of duties (current custodian excluded). */}
        {canTransferAsset && (
          <button
            type="button"
            className="asset-detail-transfer-btn"
            onClick={() => setShowTransferModal(true)}
          >
            Transfer Asset
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

          {/* Stage 4h: Transfer History — first-class transfer events
              with reason + actor + custodian/location deltas. Lives
              alongside the registration-side custodianHistory above
              so reviewers can see initial setup vs subsequent moves
              without conflating them. */}
          <TransferHistorySection
            transfers={transfers}
            now={now}
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

      {showTransferModal && (
        <TransferAssetModal
          asset={selectedAsset}
          currentUser={currentUser}
          onClose={() => setShowTransferModal(false)}
          onTransferred={() => {
            // The resource onSnapshot in CampusResource re-fetches
            // bulk; here the transfers listener above will pick up the
            // new entry within the same tick. No extra wiring needed.
          }}
        />
      )}
    </>
  );
}

// Stage 4h: dedicated renderer for Transfer History entries. The
// shared HistorySection helper assumes a one-line summary; transfers
// carry conditional custodian/location deltas + a free-form reason
// that benefits from its own layout.
function TransferHistorySection({ transfers, now }) {

  const summarizeLocation = (loc) => {
    if (!loc) return "Unassigned";
    const parts = [loc.campus, loc.building, loc.floor, loc.room]
      .map((p) => (p || "").trim())
      .filter(Boolean);
    return parts.length ? parts.join(" › ") : "Unassigned";
  };

  return (
    <div className="history-section">
      <h3>Transfer History</h3>
      {transfers.length === 0 ? (
        <p className="history-empty">No transfers yet.</p>
      ) : (
        <ul className="history-list">
          {transfers.map((t) => (
            <li key={t.id} className="history-item transfer-history-item">
              <div className="history-content">
                <div className="transfer-history-meta">
                  <strong>
                    {t.transferredBy?.name || "Unknown"}
                  </strong>
                  {t.transferredBy?.role && (
                    <span className="transfer-history-role">
                      {" · "}{t.transferredBy.role}
                    </span>
                  )}
                </div>

                {t.custodianChanged && (
                  <div className="transfer-history-delta">
                    Custodian:{" "}
                    <span className="transfer-history-old">
                      {t.oldCustodian?.name || "Unassigned"}
                    </span>
                    {" → "}
                    <span className="transfer-history-new">
                      {t.newCustodian?.name || "Unassigned"}
                    </span>
                  </div>
                )}

                {t.locationChanged && (
                  <div className="transfer-history-delta">
                    Location:{" "}
                    <span className="transfer-history-old">
                      {summarizeLocation(t.oldLocation)}
                    </span>
                    {" → "}
                    <span className="transfer-history-new">
                      {summarizeLocation(t.newLocation)}
                    </span>
                  </div>
                )}

                {t.reason && (
                  <div className="transfer-history-reason">
                    {t.reason}
                  </div>
                )}
              </div>
              <div className="history-time">
                {t.transferredAt ? relativeTime(t.transferredAt, now) : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
