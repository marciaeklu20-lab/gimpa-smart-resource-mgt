// Stage 4l — weekly report data aggregator.
//
// Reads the last `periodDays` of activity across bookings, faults,
// supplyRequests, and user signups using the Admin SDK (server-side, so
// not bound by client Firestore rules) and reduces it to a compact,
// PRIVACY-SAFE summary object.
//
// PRIVACY: the returned object contains aggregate counts and resource
// identifiers ONLY — never user names or emails. The narrative model
// (and the email body) work entirely from counts; a super_admin who
// wants names can open the app. See the Stage 4l privacy gate.
//
// Pure data shape returned (no SDK objects leak out):
//   {
//     period:     { start, end, days },
//     totals:     { bookings, faults, supplyRequests, newSignups,
//                   resolvedFaults, pendingFaults },
//     topResources:  [{ assetCode, name, bookings, faults }],   // ≤5
//     topRequesters: [{ bookings }],                            // ≤5, no PII
//     breakdowns: { bookingsByStatus, faultsBySeverity },
//     notableEvents: [string]
//   }

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Idempotent — the entrypoint module or another src file may have
// already initialized the default app. getApps() guards re-init across
// Fast Refresh / multiple imports in the same instance.
if (!getApps().length) {
  initializeApp();
}

const RESOLVED_FAULT_STATUSES = new Set(["resolved", "closed"]);
const FAULT_SEVERITIES = ["critical", "major", "minor", "cosmetic"];

// Coerce a Firestore Timestamp / Date / millis to millis, or null.
const toMillis = (v) => {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return null;
};

export async function buildReportData({ periodDays = 7 } = {}) {

  const db = getFirestore();

  const endMs = Date.now();
  const startMs = endMs - periodDays * 24 * 60 * 60 * 1000;
  const startTs = Timestamp.fromMillis(startMs);

  // Each query filters on createdAt >= start. Docs written before this
  // window (or missing createdAt) are excluded — acceptable for a
  // rolling weekly digest.
  const [bookingsSnap, faultsSnap, supplySnap, usersSnap] = await Promise.all([
    db.collection("bookings").where("createdAt", ">=", startTs).get(),
    db.collection("faults").where("createdAt", ">=", startTs).get(),
    db.collection("supplyRequests").where("createdAt", ">=", startTs).get(),
    db.collection("users").where("createdAt", ">=", startTs).get()
  ]);

  // --- bookings -----------------------------------------------------
  const bookingsByStatus = {};
  // per-resource and per-requester tallies (requester is count-only).
  const resourceTally = new Map();   // resourceId -> { name, bookings, faults }
  const requesterTally = new Map();  // requesterId -> count (PII discarded)

  const touchResource = (id, name) => {
    if (!id) return null;
    if (!resourceTally.has(id)) {
      resourceTally.set(id, { assetCode: id, name: name || id, bookings: 0, faults: 0 });
    }
    const entry = resourceTally.get(id);
    if (name && (!entry.name || entry.name === entry.assetCode)) entry.name = name;
    return entry;
  };

  bookingsSnap.forEach((doc) => {
    const b = doc.data() || {};
    const status = b.status || "pending";
    bookingsByStatus[status] = (bookingsByStatus[status] || 0) + 1;

    const entry = touchResource(b.resourceId, b.resourceName);
    if (entry) entry.bookings += 1;

    if (b.requesterId) {
      requesterTally.set(b.requesterId, (requesterTally.get(b.requesterId) || 0) + 1);
    }
  });

  // --- faults -------------------------------------------------------
  const faultsBySeverity = {};
  for (const s of FAULT_SEVERITIES) faultsBySeverity[s] = 0;
  let resolvedFaults = 0;

  faultsSnap.forEach((doc) => {
    const f = doc.data() || {};
    const severity = FAULT_SEVERITIES.includes(f.severity) ? f.severity : "minor";
    faultsBySeverity[severity] += 1;
    if (RESOLVED_FAULT_STATUSES.has(f.status)) resolvedFaults += 1;

    const entry = touchResource(f.resourceId, f.resourceName);
    if (entry) entry.faults += 1;
  });

  const faultsTotal = faultsSnap.size;
  const pendingFaults = faultsTotal - resolvedFaults;

  // --- top resources (by combined activity) -------------------------
  const topResources = Array.from(resourceTally.values())
    .sort((a, b) => (b.bookings + b.faults) - (a.bookings + a.faults))
    .slice(0, 5);

  // --- top requesters (COUNT ONLY — no id, name, or email) ----------
  const topRequesters = Array.from(requesterTally.values())
    .sort((a, b) => b - a)
    .slice(0, 5)
    .map((count) => ({ bookings: count }));

  // --- totals -------------------------------------------------------
  const totals = {
    bookings: bookingsSnap.size,
    faults: faultsTotal,
    supplyRequests: supplySnap.size,
    newSignups: usersSnap.size,
    resolvedFaults,
    pendingFaults
  };

  // --- notable events (heuristic, count-driven) ---------------------
  const notableEvents = buildNotableEvents({
    totals,
    topResources,
    faultsBySeverity
  });

  return {
    period: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      days: periodDays
    },
    totals,
    topResources,
    topRequesters,
    breakdowns: {
      bookingsByStatus,
      faultsBySeverity
    },
    notableEvents
  };
}

// Small, deterministic heuristics — these give the email a "notable
// events" section even when the narrative model is terse, and give the
// model concrete hooks to expand on. All count-derived; no PII.
function buildNotableEvents({ totals, topResources, faultsBySeverity }) {
  const events = [];

  const busiest = topResources.find((r) => r.bookings > 0);
  if (busiest) {
    events.push(
      `${busiest.name} was the most-booked resource (${busiest.bookings} booking${busiest.bookings === 1 ? "" : "s"}).`
    );
  }

  const faultProne = topResources
    .filter((r) => r.faults >= 2)
    .sort((a, b) => b.faults - a.faults)[0];
  if (faultProne) {
    events.push(
      `${faultProne.name} was reported faulty ${faultProne.faults} times — may need inspection.`
    );
  }

  if (faultsBySeverity.critical > 0) {
    events.push(
      `${faultsBySeverity.critical} critical fault${faultsBySeverity.critical === 1 ? "" : "s"} reported this period.`
    );
  }

  if (totals.newSignups > 0) {
    events.push(
      `${totals.newSignups} new user signup${totals.newSignups === 1 ? "" : "s"} awaiting or completed onboarding.`
    );
  }

  if (totals.faults > 0 && totals.resolvedFaults === totals.faults) {
    events.push("All faults reported this period were resolved.");
  }

  return events;
}
