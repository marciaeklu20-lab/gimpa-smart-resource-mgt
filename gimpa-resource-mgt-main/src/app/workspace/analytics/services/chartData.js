"use client";

// Stage 4j — shared chart-data transformations. The role views all
// rely on the same shapes for the same chart types; centralising here
// keeps the per-role view files focused on layout + period plumbing.

import {
  bucketize,
  toDate
} from "./dateUtils";

// ---------------------------------------------------------------------
// Booking helpers
// ---------------------------------------------------------------------

export const getBookingTimestamp = (b) =>
  b.createdAt || b.startDate || b.requestedAt;

export const bookingsOverTime = (bookings, period) => {
  const { buckets, bucketSize } = bucketize(
    bookings,
    getBookingTimestamp,
    period.startDate,
    period.endDate,
    null,
    {
      approved: (b) => (b.status === "approved" ? "approved" : null),
      pending:  (b) => (b.status === "pending"  ? "pending"  : null),
      rejected: (b) => (b.status === "rejected" ? "rejected" : null)
    }
  );

  const series = buckets.map((b) => ({
    label:    b.label,
    bookings: b.count,
    approved: b.approved,
    pending:  b.pending,
    rejected: b.rejected
  }));

  return { series, bucketSize };
};

export const bookingsByCategory = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    const key = b.resourceCategory || "Uncategorized";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

export const bookingsByDepartment = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    const key = b.requesterDepartment || "Central Admin";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

export const bookingsByResource = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    const key = b.resourceName || b.resourceId || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
};

export const bookingStatusBreakdown = (bookings) => {
  const counts = { approved: 0, pending: 0, rejected: 0 };
  for (const b of bookings) {
    if (counts[b.status] != null) counts[b.status] += 1;
  }
  return [
    { name: "Approved", value: counts.approved },
    { name: "Pending",  value: counts.pending },
    { name: "Rejected", value: counts.rejected }
  ];
};

// ---------------------------------------------------------------------
// Faults helpers
// ---------------------------------------------------------------------

export const getFaultReportTimestamp = (f) => f.reportedAt || f.createdAt;
export const getFaultResolutionTimestamp = (f) => f.resolvedAt;

const SEVERITY_ORDER = ["critical", "major", "minor", "cosmetic"];

export const faultsReportedVsResolved = (faults, period) => {
  // Two passes: one bucketing by reportedAt, one by resolvedAt. Keep
  // them aligned by bucket key so the chart's x-axis is consistent.
  const { buckets: reportedBuckets, bucketSize } = bucketize(
    faults,
    getFaultReportTimestamp,
    period.startDate,
    period.endDate
  );

  const { buckets: resolvedBuckets } = bucketize(
    faults.filter((f) => f.resolvedAt),
    getFaultResolutionTimestamp,
    period.startDate,
    period.endDate,
    bucketSize
  );

  const byKey = new Map();
  for (const b of reportedBuckets) {
    byKey.set(b.key, { label: b.label, reported: b.count, resolved: 0 });
  }
  for (const b of resolvedBuckets) {
    const existing = byKey.get(b.key);
    if (existing) existing.resolved = b.count;
  }

  return {
    series: Array.from(byKey.values()),
    bucketSize
  };
};

export const faultsBySeverityOverTime = (faults, period) => {
  const series = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = (item) => (item.severity === sev ? sev : null);
    return acc;
  }, {});

  const { buckets, bucketSize } = bucketize(
    faults,
    getFaultReportTimestamp,
    period.startDate,
    period.endDate,
    null,
    series
  );

  return {
    series: buckets.map((b) => ({
      label:    b.label,
      critical: b.critical,
      major:    b.major,
      minor:    b.minor,
      cosmetic: b.cosmetic
    })),
    bucketSize
  };
};

export const avgResolutionDays = (faults) => {
  let total = 0;
  let count = 0;
  for (const f of faults) {
    const reported = toDate(getFaultReportTimestamp(f));
    const resolved = toDate(getFaultResolutionTimestamp(f));
    if (!reported || !resolved) continue;
    total += (resolved.getTime() - reported.getTime()) / (1000 * 60 * 60 * 24);
    count += 1;
  }
  if (count === 0) return null;
  return total / count;
};

export const avgAcknowledgeHours = (faults) => {
  // statusHistory is a subcollection — not loaded here. Approximate
  // using `acknowledgedAt` field if maintenance writes it; otherwise
  // null. Stage 4e wrote this on the parent doc; if not, we degrade
  // gracefully.
  let total = 0;
  let count = 0;
  for (const f of faults) {
    const reported = toDate(getFaultReportTimestamp(f));
    const ack      = toDate(f.acknowledgedAt);
    if (!reported || !ack) continue;
    total += (ack.getTime() - reported.getTime()) / (1000 * 60 * 60);
    count += 1;
  }
  if (count === 0) return null;
  return total / count;
};

// ---------------------------------------------------------------------
// Supply request helpers
// ---------------------------------------------------------------------

export const getSupplyRequestTimestamp = (r) => r.createdAt || r.requestedAt;

export const supplyRequestsByStatus = (requests, period) => {
  const { buckets, bucketSize } = bucketize(
    requests,
    getSupplyRequestTimestamp,
    period.startDate,
    period.endDate,
    null,
    {
      pending:   (r) => (r.status === "pending"   ? "pending"   : null),
      approved:  (r) => (r.status === "approved"  ? "approved"  : null),
      fulfilled: (r) => (r.status === "fulfilled" ? "fulfilled" : null),
      denied:    (r) => (r.status === "denied"    ? "denied"    : null),
      cancelled: (r) => (r.status === "cancelled" ? "cancelled" : null)
    }
  );

  return {
    series: buckets.map((b) => ({
      label:     b.label,
      pending:   b.pending,
      approved:  b.approved,
      fulfilled: b.fulfilled,
      denied:    b.denied,
      cancelled: b.cancelled
    })),
    bucketSize
  };
};

// ---------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------

export const conditionDistribution = (resources) => {
  const map = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    out_of_service: 0
  };
  for (const r of resources) {
    const c = r.condition || "good";
    if (map[c] != null) map[c] += 1;
  }
  return [
    { name: "Excellent",     value: map.excellent,      fill: "#22c55e" },
    { name: "Good",          value: map.good,           fill: "#84cc16" },
    { name: "Fair",          value: map.fair,           fill: "#f59e0b" },
    { name: "Poor",          value: map.poor,           fill: "#f97316" },
    { name: "Out of service", value: map.out_of_service, fill: "#ef4444" }
  ];
};

export const lifecycleDistribution = (resources) => {
  const map = {
    active: 0,
    in_maintenance: 0,
    retired: 0,
    disposed: 0,
    lost: 0
  };
  for (const r of resources) {
    const s = r.lifecycleStatus || "active";
    if (map[s] != null) map[s] += 1;
  }
  return [
    { name: "Active",         value: map.active },
    { name: "In maintenance", value: map.in_maintenance },
    { name: "Retired",        value: map.retired },
    { name: "Disposed",       value: map.disposed },
    { name: "Lost",           value: map.lost }
  ];
};

// ---------------------------------------------------------------------
// Cross-collection KPIs
// ---------------------------------------------------------------------

export const uniqueActiveUsers = (bookings, faults) => {
  const users = new Set();
  for (const b of bookings) {
    if (b.requesterId) users.add(b.requesterId);
  }
  for (const f of faults) {
    if (f.reporterId) users.add(f.reporterId);
  }
  return users.size;
};

export const approvalRate = (bookings) => {
  let decided = 0, approved = 0;
  for (const b of bookings) {
    if (b.status === "approved") { decided++; approved++; }
    else if (b.status === "rejected") decided++;
  }
  if (decided === 0) return null;
  return (approved / decided) * 100;
};

export const totalHoursBooked = (bookings) => {
  let totalMs = 0;
  for (const b of bookings) {
    const start = toDate(b.startDate);
    const end   = toDate(b.endDate);
    if (!start || !end) continue;
    if (end.getTime() <= start.getTime()) continue;
    totalMs += end.getTime() - start.getTime();
  }
  return totalMs / (1000 * 60 * 60);
};

// ---------------------------------------------------------------------
// Number formatting — used by KPI display + tables
// ---------------------------------------------------------------------

export const formatNumber = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("en-GB");
  return n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
};

export const formatPct = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(0)}%`;
};

export const formatDaysOrHours = (days) => {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 1) return `${(days * 24).toFixed(1)} hrs`;
  return `${days.toFixed(1)} days`;
};
