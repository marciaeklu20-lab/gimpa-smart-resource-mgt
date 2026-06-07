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
//     topFaultResources: [{ assetCode, name, faults }],          // ≤3
//     topRequesters: [{ bookings }],                            // ≤5, no PII
//     breakdowns: { bookingsByStatus, faultsBySeverity },
//     supply:     { byStatus, topItems: [{ name, requests, quantity }] }, // ≤3
//     assetConditions: { byCondition, attention: [{ assetCode, name,
//                        condition }], attentionTotal },          // Stage 4l
//     notableEvents: [string]
//   }
//
// `supply` + `assetConditions` + `topFaultResources` feed the Stage 4l
// maintenance report variant (faults / supply / asset condition); the
// full executive variant ignores them. assetConditions is a CURRENT-state
// snapshot of the resources collection, not time-windowed.

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

// Stage 4l maintenance variant: resource condition enum (mirrors
// src/app/lib/resourceMeta.js) + the subset that warrants attention in
// the maintenance brief.
const CONDITIONS = ["excellent", "good", "fair", "poor", "out_of_service"];
const ATTENTION_CONDITIONS = new Set(["fair", "poor", "out_of_service"]);
// Cap the attention list so a large fleet can't bloat the email.
const ATTENTION_LIST_CAP = 20;

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
  const [bookingsSnap, faultsSnap, supplySnap, usersSnap, resourcesSnap] = await Promise.all([
    db.collection("bookings").where("createdAt", ">=", startTs).get(),
    db.collection("faults").where("createdAt", ">=", startTs).get(),
    db.collection("supplyRequests").where("createdAt", ">=", startTs).get(),
    db.collection("users").where("createdAt", ">=", startTs).get(),
    // Asset condition is a current-state snapshot (NOT time-windowed) for
    // the Stage 4l maintenance report variant.
    db.collection("resources").get()
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

  // --- supply requests (status breakdown + most-requested items) ----
  // Stage 4l maintenance variant. items[] carries { resourceName,
  // quantityRequested } per createSupplyRequest.js.
  const supplyByStatus = {};
  const supplyItemTally = new Map(); // resourceName -> { name, requests, quantity }

  supplySnap.forEach((doc) => {
    const s = doc.data() || {};
    const status = s.status || "pending";
    supplyByStatus[status] = (supplyByStatus[status] || 0) + 1;

    const items = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      const name = it?.resourceName;
      if (!name) continue;
      if (!supplyItemTally.has(name)) {
        supplyItemTally.set(name, { name, requests: 0, quantity: 0 });
      }
      const entry = supplyItemTally.get(name);
      entry.requests += 1;
      const qty = Number(it.quantityRequested);
      if (Number.isFinite(qty)) entry.quantity += qty;
    }
  });

  const topSupplyItems = Array.from(supplyItemTally.values())
    .sort((a, b) => (b.quantity - a.quantity) || (b.requests - a.requests))
    .slice(0, 3);

  // --- asset condition snapshot (current state, all resources) ------
  // Stage 4l maintenance variant. Not time-windowed: reflects the fleet
  // as it stands now, not just resources touched this period.
  const conditionCounts = {};
  for (const c of CONDITIONS) conditionCounts[c] = 0;
  const attention = [];

  resourcesSnap.forEach((doc) => {
    const r = doc.data() || {};
    const condition = CONDITIONS.includes(r.condition) ? r.condition : "good";
    conditionCounts[condition] += 1;
    if (ATTENTION_CONDITIONS.has(condition)) {
      attention.push({
        assetCode: doc.id,
        name: r.resourceName || doc.id,
        condition
      });
    }
  });

  // Worst-condition first so the email leads with out_of_service.
  const conditionRank = { out_of_service: 0, poor: 1, fair: 2 };
  attention.sort(
    (a, b) => (conditionRank[a.condition] ?? 3) - (conditionRank[b.condition] ?? 3)
  );

  // --- top resources (by combined activity) -------------------------
  const topResources = Array.from(resourceTally.values())
    .sort((a, b) => (b.bookings + b.faults) - (a.bookings + a.faults))
    .slice(0, 5);

  // --- top fault-prone resources (maintenance variant) --------------
  // Derived from the full tally (not topResources, which is capped at 5
  // by combined activity and could drop a fault-heavy resource).
  const topFaultResources = Array.from(resourceTally.values())
    .filter((r) => r.faults > 0)
    .sort((a, b) => b.faults - a.faults)
    .slice(0, 3)
    .map((r) => ({ assetCode: r.assetCode, name: r.name, faults: r.faults }));

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
    topFaultResources,
    topRequesters,
    breakdowns: {
      bookingsByStatus,
      faultsBySeverity
    },
    supply: {
      byStatus: supplyByStatus,
      topItems: topSupplyItems
    },
    assetConditions: {
      byCondition: conditionCounts,
      attention: attention.slice(0, ATTENTION_LIST_CAP),
      attentionTotal: attention.length
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
