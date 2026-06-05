"use client";

/**
 * Stage 4q — Pattern detection rules.
 *
 * These rules are deterministic operational heuristics, NOT machine
 * learning or LLM-generated. The intelligence here is in the
 * curation: which patterns matter, what thresholds trigger an
 * alert, and how to phrase the recommendation. Each rule is a pure
 * function that can be tested in isolation.
 *
 * The dissertation should describe this as "rule-based operational
 * intelligence" and reserve "AI" for Stage 4p (the Gemini-backed
 * availability bot).
 */

import {
  inPeriod,
  priorPeriod,
  toDate
} from "../services/dateUtils";
import {
  getBookingTimestamp,
  getFaultReportTimestamp,
  getFaultResolutionTimestamp,
  getSupplyRequestTimestamp,
  avgResolutionDays
} from "../services/chartData";
import { categoriesForRole } from "@/app/lib/categoryResponsibility";

// Role buckets — single source of truth so rule applicability is
// declared in one place rather than scattered across `if (role === …)`
// checks inside every rule.
export const PLATFORM_VIEW_ROLES = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management"
];

export const RESOURCE_MANAGER_ROLES = [
  "Facility/Estate Officer",
  "Logistics Officer",
  "Stores/Inventory Officer"
];

export const MAINTENANCE_VIEW_ROLES = [
  "super_admin",
  "Maintenance Admin",
  "Maintenance Staff"
];

export const BOOKER_VIEW_ROLES = [
  "Lecturer",
  "Teaching Assistant",
  "Course Rep",
  "student"
];

const STORES_OFFICER = "Stores/Inventory Officer";

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

const pct = (numerator, denominator) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

const formatPct = (n) => `${Math.round(n)}%`;

const formatSignedPct = (n) => {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(n))}%`;
};

// Scope helpers — resource-manager and booker views work over slices
// of the full collections. Rule callers pre-filter where possible; we
// keep these tiny utilities centralised so rules read uniformly.
const filterToResponsibility = (resources, role) =>
  resources.filter((r) => r.responsibleRole === role);

const idsOf = (resources) => new Set(
  resources.map((r) => r.assetCode || r.id)
);

// ---------------------------------------------------------------------
// 1. bookingVolumeChange  —  applies to every view.
// ---------------------------------------------------------------------
export const bookingVolumeChange = (data, period, currentUser) => {
  const role = currentUser?.role;
  const bookings = data?.bookings || [];
  if (!period || bookings.length === 0) return null;

  // Booker view scopes to my-own bookings.
  const isBookerView = BOOKER_VIEW_ROLES.includes(role);
  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);

  let scoped = bookings;
  if (isBookerView) {
    scoped = bookings.filter((b) => b.requesterId === currentUser?.uid);
  } else if (isRmView) {
    const myIds = idsOf(filterToResponsibility(data?.resources || [], role));
    scoped = bookings.filter((b) => myIds.has(b.resourceId));
  }

  const curr = inPeriod(scoped, getBookingTimestamp, period).length;
  const prev = inPeriod(scoped, getBookingTimestamp, priorPeriod(period)).length;

  if (prev === 0 && curr === 0) return null;

  const deltaPct = prev === 0 ? 100 : ((curr - prev) / prev) * 100;
  if (Math.abs(deltaPct) < 20) return null;

  const direction = deltaPct > 0 ? "up" : "down";
  const sentiment = isBookerView
    ? (direction === "up"
        ? "You've booked more this period."
        : "You've booked less this period.")
    : (direction === "up"
        ? "Higher demand than the prior period — capacity to watch."
        : "Lower demand than the prior period — investigate idle inventory.");

  return {
    id: "booking-volume-change",
    category: "usage",
    severity: Math.abs(deltaPct) >= 50 ? "warning" : "info",
    title: isBookerView
      ? `Your bookings ${direction === "up" ? "up" : "down"} ${formatSignedPct(deltaPct)} this period`
      : `Bookings ${direction === "up" ? "up" : "down"} ${formatSignedPct(deltaPct)} this period`,
    description: `${sentiment} Total ${direction === "up" ? "rose" : "fell"} to ${curr} from ${prev} prior.`,
    metric: { current: curr, prior: prev, delta: formatSignedPct(deltaPct) },
    target: null,
    sortWeight: Math.abs(deltaPct)
  };
};
bookingVolumeChange.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES,
  ...MAINTENANCE_VIEW_ROLES,
  ...BOOKER_VIEW_ROLES
];

// ---------------------------------------------------------------------
// 2. topUtilizedResource  —  Platform + ResourceManager.
// ---------------------------------------------------------------------
export const topUtilizedResource = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!topUtilizedResource.applicableRoles.includes(role)) return null;

  const bookings = data?.bookings || [];
  const resources = data?.resources || [];
  if (!period || bookings.length === 0) return null;

  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);
  let scopedBookings = bookings;
  if (isRmView) {
    const myIds = idsOf(filterToResponsibility(resources, role));
    scopedBookings = bookings.filter((b) => myIds.has(b.resourceId));
  }
  const inPer = inPeriod(scopedBookings, getBookingTimestamp, period);
  if (inPer.length === 0) return null;

  const counts = new Map();
  for (const b of inPer) {
    const key = b.resourceId || b.resourceName;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let topId = null, topName = null, topCount = 0;
  for (const [k, c] of counts) {
    if (c > topCount) { topCount = c; topId = k; }
  }
  if (!topId) return null;

  const share = pct(topCount, inPer.length);
  if (share < 25) return null;

  const sample = inPer.find((b) => (b.resourceId || b.resourceName) === topId);
  topName = sample?.resourceName || topId;

  return {
    id: "top-utilized-resource",
    category: "usage",
    severity: share >= 40 ? "warning" : "info",
    title: `${topName} took ${formatPct(share)} of bookings`,
    description: `${topCount} of ${inPer.length} bookings this period went to ${topName}. Check for capacity strain.`,
    metric: { current: topCount, prior: inPer.length, delta: formatPct(share) },
    target: {
      sidebar: "Resource Management",
      tab:     "Campus Resources",
      assetId: topId
    },
    sortWeight: share
  };
};
topUtilizedResource.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES
];

// ---------------------------------------------------------------------
// 3. approvalBottleneck  —  Platform only.
// ---------------------------------------------------------------------
export const approvalBottleneck = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!approvalBottleneck.applicableRoles.includes(role)) return null;

  const bookings = data?.bookings || [];
  if (!period) return null;
  const inPer = inPeriod(bookings, getBookingTimestamp, period);

  let total = 0, count = 0;
  for (const b of inPer) {
    if (b.status !== "approved") continue;
    const created  = toDate(b.createdAt);
    const approved = toDate(b.approvedAt);
    if (!created || !approved) continue;
    const hrs = (approved.getTime() - created.getTime()) / (1000 * 60 * 60);
    if (hrs < 0) continue;
    total += hrs;
    count += 1;
  }
  if (count === 0) return null;

  const avgHrs = total / count;
  if (avgHrs < 24) return null;

  return {
    id: "approval-bottleneck",
    category: "usage",
    severity: avgHrs >= 72 ? "action" : "warning",
    title: `Bookings take ${avgHrs.toFixed(1)} hrs to approve`,
    description: `Average pending → approved time across ${count} approvals this period. Review the approval queue cadence.`,
    metric: { current: Number(avgHrs.toFixed(1)), prior: 24, delta: `${avgHrs.toFixed(1)} h` },
    target: {
      sidebar: "Admin Dashboard",
      tab:     "Approvals"
    },
    sortWeight: avgHrs
  };
};
approvalBottleneck.applicableRoles = [...PLATFORM_VIEW_ROLES];

// ---------------------------------------------------------------------
// 4. recurrentFault  —  Platform / ResourceManager / Maintenance.
// ---------------------------------------------------------------------
export const recurrentFault = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!recurrentFault.applicableRoles.includes(role)) return null;

  const faults = data?.faults || [];
  const resources = data?.resources || [];
  if (!period || faults.length === 0) return null;

  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);
  let scoped = faults;
  if (isRmView) {
    const myIds = idsOf(filterToResponsibility(resources, role));
    scoped = faults.filter((f) => myIds.has(f.resourceId));
  }
  const inPer = inPeriod(scoped, getFaultReportTimestamp, period);

  const counts = new Map();
  const nameByRes = new Map();
  for (const f of inPer) {
    const k = f.resourceId;
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!nameByRes.has(k)) nameByRes.set(k, f.resourceName || k);
  }

  let topId = null, topCount = 0;
  for (const [k, c] of counts) {
    if (c > topCount) { topCount = c; topId = k; }
  }
  if (!topId || topCount < 2) return null;

  const name = nameByRes.get(topId) || topId;

  return {
    id: "recurrent-fault",
    category: "maintenance",
    severity: topCount >= 4 ? "action" : "warning",
    title: `${name} reported ${topCount} faults`,
    description: `${name} has had ${topCount} fault reports this period. Schedule preventive maintenance or inspection.`,
    metric: { current: topCount, prior: 1, delta: `${topCount}×` },
    target: {
      sidebar: "Resource Management",
      tab:     "Campus Resources",
      assetId: topId
    },
    sortWeight: topCount
  };
};
recurrentFault.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES,
  ...MAINTENANCE_VIEW_ROLES
];

// ---------------------------------------------------------------------
// 5. slowResolution  —  Maintenance / Platform.
// ---------------------------------------------------------------------
export const slowResolution = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!slowResolution.applicableRoles.includes(role)) return null;

  const faults = data?.faults || [];
  if (!period) return null;
  const inPer = inPeriod(faults, getFaultReportTimestamp, period);
  const resolved = inPer.filter((f) => f.status === "resolved" && f.resolvedAt);
  if (resolved.length === 0) return null;

  let overSla = 0;
  for (const f of resolved) {
    const reported = toDate(getFaultReportTimestamp(f));
    const finished = toDate(getFaultResolutionTimestamp(f));
    if (!reported || !finished) continue;
    const days = (finished.getTime() - reported.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 5) overSla += 1;
  }
  const share = pct(overSla, resolved.length);
  if (share < 25) return null;

  const avgDays = avgResolutionDays(resolved);

  return {
    id: "slow-resolution",
    category: "maintenance",
    severity: share >= 50 ? "action" : "warning",
    title: `${formatPct(share)} of faults exceeded the 5-day SLA`,
    description: `${overSla} of ${resolved.length} resolved faults this period took longer than 5 days. Average resolution ${avgDays?.toFixed(1) ?? "—"} days.`,
    metric: { current: overSla, prior: resolved.length, delta: formatPct(share) },
    target: null,
    sortWeight: share
  };
};
slowResolution.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...MAINTENANCE_VIEW_ROLES
];

// ---------------------------------------------------------------------
// 6. supplyRequestVolume  —  Platform / Maintenance / Stores.
// ---------------------------------------------------------------------
export const supplyRequestVolume = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!supplyRequestVolume.applicableRoles.includes(role)) return null;

  const requests = data?.supplyRequests || [];
  if (!period) return null;
  const inPer = inPeriod(requests, getSupplyRequestTimestamp, period);
  if (inPer.length === 0) return null;

  const itemCounts = new Map();
  for (const r of inPer) {
    if (!Array.isArray(r.items)) continue;
    for (const item of r.items) {
      const name = (item?.name || item?.description || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const entry = itemCounts.get(key) || { name, count: 0 };
      entry.count += 1;
      itemCounts.set(key, entry);
    }
  }

  let top = null;
  for (const entry of itemCounts.values()) {
    if (!top || entry.count > top.count) top = entry;
  }
  if (!top || top.count < 3) return null;

  return {
    id: "supply-request-volume",
    category: "supply",
    severity: top.count >= 6 ? "warning" : "info",
    title: `"${top.name}" requested ${top.count} times`,
    description: `${top.name} has appeared on ${top.count} supply requests this period. Consider bulk procurement.`,
    metric: { current: top.count, prior: 0, delta: `${top.count}×` },
    target: null,
    sortWeight: top.count
  };
};
supplyRequestVolume.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...MAINTENANCE_VIEW_ROLES,
  STORES_OFFICER
];

// ---------------------------------------------------------------------
// 7. decliningCondition  —  Platform / ResourceManager.
// ---------------------------------------------------------------------
export const decliningCondition = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!decliningCondition.applicableRoles.includes(role)) return null;

  const resources = data?.resources || [];
  if (resources.length === 0) return null;

  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);
  const scope = isRmView ? filterToResponsibility(resources, role) : resources;
  if (scope.length === 0) return null;

  let worse = 0;
  for (const r of scope) {
    const c = r.condition || "good";
    if (c === "fair" || c === "poor" || c === "out_of_service") worse += 1;
  }
  const share = pct(worse, scope.length);
  if (share < 30) return null;

  return {
    id: "declining-condition",
    category: "lifecycle",
    severity: share >= 50 ? "action" : "warning",
    title: `${formatPct(share)} of ${isRmView ? "your" : "the"} assets are fair or worse`,
    description: `${worse} of ${scope.length} ${isRmView ? "of your" : "tracked"} resources are at fair condition or below. Plan refurbishment or capital replacement.`,
    metric: { current: worse, prior: scope.length, delta: formatPct(share) },
    target: null,
    sortWeight: share
  };
};
decliningCondition.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES
];

// ---------------------------------------------------------------------
// 8. idleResource  —  Platform / ResourceManager.
// ---------------------------------------------------------------------
export const idleResource = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!idleResource.applicableRoles.includes(role)) return null;

  const resources = data?.resources || [];
  const bookings = data?.bookings || [];
  if (resources.length === 0) return null;

  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);
  const scope = isRmView ? filterToResponsibility(resources, role) : resources;
  if (scope.length === 0) return null;

  const bookedThisPeriod = new Set(
    inPeriod(bookings, getBookingTimestamp, period).map((b) => b.resourceId)
  );

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const idle = [];
  for (const r of scope) {
    if ((r.lifecycleStatus || "active") !== "active") continue;
    const created = toDate(r.createdAt);
    if (!created || created.getTime() > ninetyDaysAgo.getTime()) continue;
    const id = r.assetCode || r.id;
    if (bookedThisPeriod.has(id)) continue;
    idle.push({ id, name: r.resourceName || id });
  }
  if (idle.length === 0) return null;

  const top = idle[0];
  const more = idle.length - 1;

  return {
    id: "idle-resource",
    category: "lifecycle",
    severity: idle.length >= 5 ? "warning" : "info",
    title: `${idle.length} active resource${idle.length === 1 ? "" : "s"} had no bookings`,
    description: more > 0
      ? `${top.name} and ${more} other${more === 1 ? "" : "s"} (>= 90 days old) saw no bookings this period. Consider repurposing or marking retired.`
      : `${top.name} (>= 90 days old) saw no bookings this period. Consider repurposing or marking retired.`,
    metric: { current: idle.length, prior: scope.length, delta: `${idle.length} idle` },
    target: {
      sidebar: "Resource Management",
      tab:     "Campus Resources",
      assetId: top.id
    },
    sortWeight: idle.length
  };
};
idleResource.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES
];

// ---------------------------------------------------------------------
// 9. warrantyExpiringSoon  —  Platform / ResourceManager.
// ---------------------------------------------------------------------
export const warrantyExpiringSoon = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!warrantyExpiringSoon.applicableRoles.includes(role)) return null;

  const resources = data?.resources || [];
  if (resources.length === 0) return null;

  const isRmView = RESOURCE_MANAGER_ROLES.includes(role);
  const scope = isRmView ? filterToResponsibility(resources, role) : resources;

  const now = Date.now();
  const horizon = now + 90 * 24 * 60 * 60 * 1000;

  const expiring = [];
  for (const r of scope) {
    const d = toDate(r.warrantyExpiry);
    if (!d) continue;
    const ts = d.getTime();
    if (ts >= now && ts <= horizon) {
      expiring.push({
        id: r.assetCode || r.id,
        name: r.resourceName || r.assetCode,
        date: d
      });
    }
  }
  if (expiring.length === 0) return null;

  expiring.sort((a, b) => a.date.getTime() - b.date.getTime());
  const top = expiring[0];

  return {
    id: "warranty-expiring-soon",
    category: "lifecycle",
    severity: expiring.length >= 5 ? "warning" : "info",
    title: `${expiring.length} warrant${expiring.length === 1 ? "y" : "ies"} expiring within 90 days`,
    description: `Earliest: ${top.name} on ${top.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}. Confirm renewals before lapse.`,
    metric: { current: expiring.length, prior: scope.length, delta: `${expiring.length} ≤ 90d` },
    target: {
      sidebar: "Resource Management",
      tab:     "Campus Resources",
      assetId: top.id
    },
    sortWeight: expiring.length
  };
};
warrantyExpiringSoon.applicableRoles = [
  ...PLATFORM_VIEW_ROLES,
  ...RESOURCE_MANAGER_ROLES
];

// ---------------------------------------------------------------------
// 10. heavyUser  —  Platform.
// ---------------------------------------------------------------------
export const heavyUser = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!heavyUser.applicableRoles.includes(role)) return null;

  const bookings = data?.bookings || [];
  if (!period) return null;
  const inPer = inPeriod(bookings, getBookingTimestamp, period);
  if (inPer.length === 0) return null;

  const counts = new Map();
  for (const b of inPer) {
    const uid = b.requesterId;
    if (!uid) continue;
    const entry = counts.get(uid) || { uid, name: b.requesterName || uid, count: 0 };
    entry.count += 1;
    counts.set(uid, entry);
  }

  let top = null;
  for (const entry of counts.values()) {
    if (!top || entry.count > top.count) top = entry;
  }
  if (!top) return null;

  const share = pct(top.count, inPer.length);
  if (share < 30) return null;

  return {
    id: "heavy-user",
    category: "usage",
    severity: share >= 50 ? "warning" : "info",
    title: `${top.name} drove ${formatPct(share)} of bookings`,
    description: `${top.name} submitted ${top.count} of ${inPer.length} bookings this period. Worth checking for departmental concentration.`,
    metric: { current: top.count, prior: inPer.length, delta: formatPct(share) },
    target: null,
    sortWeight: share
  };
};
heavyUser.applicableRoles = [...PLATFORM_VIEW_ROLES];

// ---------------------------------------------------------------------
// Registry + runner.
// ---------------------------------------------------------------------

export const ALL_RULES = [
  bookingVolumeChange,
  topUtilizedResource,
  approvalBottleneck,
  recurrentFault,
  slowResolution,
  supplyRequestVolume,
  decliningCondition,
  idleResource,
  warrantyExpiringSoon,
  heavyUser
];

const SEVERITY_ORDER = { action: 0, warning: 1, info: 2 };

export const computeInsights = (data, period, currentUser) => {
  const role = currentUser?.role;
  if (!role || !period) return [];

  const out = [];
  for (const rule of ALL_RULES) {
    if (rule.applicableRoles && !rule.applicableRoles.includes(role)) continue;
    let result;
    try {
      result = rule(data, period, currentUser);
    } catch (err) {
      // A rule throwing shouldn't bring down the panel — log + skip.
      console.warn(`Insight rule ${rule.name} threw:`, err);
      continue;
    }
    if (result) out.push(result);
  }

  out.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] ?? 99;
    const sevB = SEVERITY_ORDER[b.severity] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    return (b.sortWeight ?? 0) - (a.sortWeight ?? 0);
  });

  return out.slice(0, 6);
};

// Used by analytics views' role-routing — pure convenience export to
// avoid importing categoriesForRole separately.
export { categoriesForRole };

// ---------------------------------------------------------------------
// insightsExportSection — turns the computed insights into the
// { title, columns, rows } shape exportCsv/exportPdf expect. Returns
// null when there are no insights so the section is dropped quietly.
// ---------------------------------------------------------------------

const SEVERITY_LABEL = {
  action:  "Action",
  warning: "Watch",
  info:    "Info"
};

export const insightsExportSection = (data, period, currentUser) => {
  const insights = computeInsights(data, period, currentUser);
  if (!insights.length) return null;
  return {
    title:   "Insights — pattern detection",
    columns: ["Severity", "Title", "Description", "Metric"],
    rows: insights.map((i) => [
      SEVERITY_LABEL[i.severity] || i.severity,
      i.title,
      i.description,
      i.metric?.delta || ""
    ])
  };
};
