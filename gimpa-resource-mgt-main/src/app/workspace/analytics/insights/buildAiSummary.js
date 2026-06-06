"use client";

// Stage 4q.2 — privacy-safe summary builder for the Gemini call.
//
// Strict rules:
//   - No requester/reporter/custodian names, emails, or uids.
//   - Department names with individual counts < 3 are dropped
//     (k-anonymity floor).
//   - Target payload size is < 3 KB.
//
// We pre-aggregate everything the model needs so the prompt body
// contains only counts and category labels — no individual records.

import {
  inPeriod,
  priorPeriod,
  toDate,
  formatRangeISO
} from "../services/dateUtils";
import {
  getBookingTimestamp,
  getFaultReportTimestamp,
  getFaultResolutionTimestamp,
  getSupplyRequestTimestamp,
  conditionDistribution
} from "../services/chartData";
import { computeInsights } from "./insightRules";

const K_ANON_MIN = 3;

const sevSeed = () => ({ critical: 0, major: 0, minor: 0, cosmetic: 0 });

const median = (numbers) => {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

// Top resources by combined booking + fault activity. Dedup by
// assetCode; keep at most 8 rows so the prompt stays compact.
const topResources = (resources, bookings, faults) => {
  const counts = new Map();
  for (const b of bookings) {
    const k = b.resourceId;
    if (!k) continue;
    const entry = counts.get(k) || { bookings: 0, faults: 0, name: b.resourceName || k };
    entry.bookings += 1;
    counts.set(k, entry);
  }
  for (const f of faults) {
    const k = f.resourceId;
    if (!k) continue;
    const entry = counts.get(k) || { bookings: 0, faults: 0, name: f.resourceName || k };
    entry.faults += 1;
    counts.set(k, entry);
  }
  const nameByCode = new Map(
    resources.map((r) => [r.assetCode || r.id, r.resourceName || r.assetCode])
  );
  return Array.from(counts.entries())
    .map(([assetCode, v]) => ({
      assetCode,
      name: nameByCode.get(assetCode) || v.name,
      bookings: v.bookings,
      faults: v.faults,
      score: v.bookings + v.faults * 2
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...rest }) => rest);
};

// Per-category counts. Department-style aggregation; doesn't expose
// individual users.
const categoryBreakdown = (bookings, faults) => {
  const map = new Map();
  for (const b of bookings) {
    const c = b.resourceCategory || "Uncategorized";
    const entry = map.get(c) || { category: c, bookings: 0, faults: 0 };
    entry.bookings += 1;
    map.set(c, entry);
  }
  for (const f of faults) {
    const c = f.resourceCategory || "Uncategorized";
    const entry = map.get(c) || { category: c, bookings: 0, faults: 0 };
    entry.faults += 1;
    map.set(c, entry);
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.bookings + b.faults) - (a.bookings + a.faults)
  );
};

const conditionAggregate = (resources) => {
  const arr = conditionDistribution(resources);
  return arr.reduce((acc, item) => {
    const key = item.name.toLowerCase().replace(/\s+/g, "_");
    acc[key] = item.value;
    return acc;
  }, {});
};

const faultsBySeverity = (faults) => {
  const seed = sevSeed();
  for (const f of faults) {
    const s = String(f.severity || "").toLowerCase();
    if (s in seed) seed[s] += 1;
  }
  return seed;
};

const resolutionStats = (faults) => {
  const days = [];
  let slowCount = 0;
  for (const f of faults) {
    if (f.status !== "resolved") continue;
    const reported = toDate(getFaultReportTimestamp(f));
    const resolved = toDate(getFaultResolutionTimestamp(f));
    if (!reported || !resolved) continue;
    const d = (resolved.getTime() - reported.getTime()) / (1000 * 60 * 60 * 24);
    if (d < 0) continue;
    days.push(d);
    if (d > 5) slowCount += 1;
  }
  if (days.length === 0) {
    return { avgDays: null, medianDays: null, slowCount: 0 };
  }
  const sum = days.reduce((a, b) => a + b, 0);
  return {
    avgDays:    Number((sum / days.length).toFixed(2)),
    medianDays: Number((median(days) || 0).toFixed(2)),
    slowCount
  };
};

const uniqueActiveUserCount = (bookings, faults) => {
  const set = new Set();
  for (const b of bookings) if (b.requesterId) set.add(b.requesterId);
  for (const f of faults) if (f.reporterId) set.add(f.reporterId);
  return set.size;
};

const departmentAggregateAnon = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    const d = b.requesterDepartment || "Central Admin";
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  // k-anonymity floor — any department with < K_ANON_MIN bookings
  // gets folded into an "Other" bucket so individual users aren't
  // implicitly identifiable.
  let otherTotal = 0;
  const safe = [];
  for (const [name, count] of counts) {
    if (count < K_ANON_MIN) otherTotal += count;
    else safe.push({ department: name, bookings: count });
  }
  if (otherTotal > 0) safe.push({ department: "Other (combined)", bookings: otherTotal });
  return safe.sort((a, b) => b.bookings - a.bookings);
};

// ---------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------

export function buildAiSummary({ bookings = [], faults = [], supplyRequests = [], resources = [] }, period) {

  if (!period) {
    return { period: null, counts: {}, ruleInsights: [] };
  }

  const prior = priorPeriod(period);

  const bookingsIn = inPeriod(bookings, getBookingTimestamp, period);
  const bookingsPriorIn = inPeriod(bookings, getBookingTimestamp, prior);
  const faultsIn  = inPeriod(faults, getFaultReportTimestamp, period);
  const supplyIn  = inPeriod(supplyRequests, getSupplyRequestTimestamp, period);

  const summary = {
    period: {
      label: period.label,
      start: formatRangeISO(period.startDate),
      end:   formatRangeISO(period.endDate),
      days:  Math.round(
        (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    },
    counts: {
      bookings:        bookingsIn.length,
      bookingsPrior:   bookingsPriorIn.length,
      faults:          faultsIn.length,
      faultsResolved:  faultsIn.filter((f) => f.status === "resolved").length,
      supplyRequests:  supplyIn.length,
      supplyFulfilled: supplyIn.filter((r) => r.status === "fulfilled").length,
      activeUsers:     uniqueActiveUserCount(bookingsIn, faultsIn)
    },
    topResources:        topResources(resources, bookingsIn, faultsIn),
    faultsBySeverity:    faultsBySeverity(faultsIn),
    resolution:          resolutionStats(faultsIn),
    categoryBreakdown:   categoryBreakdown(bookingsIn, faultsIn),
    conditionDistribution: conditionAggregate(resources),
    departments:         departmentAggregateAnon(bookingsIn)
  };

  // Compute rule-based insights (without uid context — we don't pass a
  // navigate-shaped target across the wire) so the LLM can complement
  // them. We only forward {category, title, severity} to avoid sending
  // the rule's internal sortWeight / target keys.
  const ruleInsights = computeInsights(
    { bookings: bookingsIn, faults: faultsIn, supplyRequests: supplyIn, resources },
    period,
    // Use a synthetic user object so every applicable rule fires — the
    // prompt-side complement check doesn't need role partitioning.
    { role: "super_admin", uid: "summary-builder" }
  ).slice(0, 6).map((i) => ({
    category: i.category,
    title:    i.title,
    severity: i.severity
  }));

  summary.ruleInsights = ruleInsights;

  return summary;
}

// Whether the period has enough data to be worth asking Gemini.
// Returns true only when there's at least one booking OR fault OR
// supply-request in the period — empty windows produce empty / dull
// insights and waste a call.
export function isSummaryWorthSending(summary) {
  const c = summary?.counts;
  if (!c) return false;
  return (c.bookings || 0) + (c.faults || 0) + (c.supplyRequests || 0) > 0;
}
