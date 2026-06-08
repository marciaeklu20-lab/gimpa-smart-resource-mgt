"use client";

// Stage 4o Phase 2 — Movement History for a single asset.
//
// Renders below the Bookings section in AssetDetailPanel. Live-subscribes
// to the resourceMovements audit log for this asset (most recent 20) and
// lists each location transition with a colour-coded source badge, the
// from→to buildings, a relative timestamp, the triggering role (no names
// — PII discipline), and an optional note.

import { useEffect, useState } from "react";

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
import { relativeTime } from "@/app/lib/resourceMeta";

import "@/app/styles/movements/MovementHistory.css";

const db = getFirestore(app);

// Colour-coded source badges. Phase 2 emits "home" + "qr-checkin"; the
// rest are reserved for the Phase 3 event listeners.
const SOURCE_META = {
  home:         { label: "Home",         className: "movement-badge-home" },
  "qr-checkin": { label: "QR check-in",  className: "movement-badge-qr" },
  manual:       { label: "Manual",       className: "movement-badge-manual" },
  booking:      { label: "Booking",      className: "movement-badge-booking" },
  transfer:     { label: "Transfer",     className: "movement-badge-transfer" },
  maintenance:  { label: "Maintenance",  className: "movement-badge-maintenance" },
  supply:       { label: "Supply",       className: "movement-badge-supply" },
  lifecycle:    { label: "Lifecycle",    className: "movement-badge-lifecycle" }
};

function sourceMeta(source) {
  if (!source) return { label: "Unknown", className: "movement-badge-unknown" };
  // Phase 3 sources may be namespaced like "booking:BKG-12" — match on
  // the prefix before the colon.
  const key = source.split(":")[0];
  return (
    SOURCE_META[key] || { label: source, className: "movement-badge-unknown" }
  );
}

function buildingOf(loc) {
  return loc?.building || "Unknown";
}

export default function MovementHistorySection({ assetCode }) {

  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!assetCode) {
      setMovements([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const q = query(
      collection(db, "resourceMovements"),
      where("resourceId", "==", assetCode),
      orderBy("triggeredAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMovements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("[MovementHistorySection] listener:", err);
        setError(true);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [assetCode]);

  const now = Date.now();

  return (
    <div className="history-section">
      <h3>Movement History</h3>

      {loading ? (
        <p className="history-empty">Loading movement history…</p>
      ) : error ? (
        <p className="history-empty">Couldn’t load movement history.</p>
      ) : movements.length === 0 ? (
        <p className="history-empty">No movement history recorded yet.</p>
      ) : (
        <ul className="history-list">
          {movements.map((m) => {
            const meta = sourceMeta(m.source);
            return (
              <li key={m.id} className="history-item movement-history-item">
                <div className="history-content">
                  <div className="movement-history-line">
                    <span className={`movement-badge ${meta.className}`}>
                      {meta.label}
                    </span>
                    <span className="movement-transition">
                      {buildingOf(m.from)}
                      {" → "}
                      <strong>{buildingOf(m.to)}</strong>
                    </span>
                  </div>

                  {m.triggeredByRole && (
                    <div className="movement-history-role">
                      by {m.triggeredByRole}
                    </div>
                  )}

                  {m.note && (
                    <div className="movement-history-note">{m.note}</div>
                  )}
                </div>
                <div className="history-time">
                  {m.triggeredAt ? relativeTime(m.triggeredAt, now) : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
