// Pure aggregations over the bookings collection.
// Each function takes the raw bookings array (as written by createBooking.js)
// and returns the shape recharts expects: an array of { name, value, ... }.
// No Firestore / React in this file — keep it testable.

import { CENTRAL_ADMIN_LABEL } from "@/app/constants/departments";

const DAY_NAMES = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
];

const STATUS_ORDER = ["pending", "approved", "rejected"];

const incrementCount = (map, key) => {
  map.set(key, (map.get(key) || 0) + 1);
};

const mapToSortedArray = (map, { sortByValueDesc = true } = {}) => {
  const arr = Array.from(map, ([name, value]) => ({ name, value }));
  if (sortByValueDesc) {
    arr.sort((a, b) => b.value - a.value);
  }
  return arr;
};

export const bookingsByResource = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    incrementCount(counts, b.resourceName || b.resourceId || "Unknown");
  }
  return mapToSortedArray(counts);
};

export const bookingsByDepartment = (bookings) => {
  const counts = new Map();
  for (const b of bookings) {
    incrementCount(counts, b.requesterDepartment || CENTRAL_ADMIN_LABEL);
  }
  return mapToSortedArray(counts);
};

export const bookingsByStatus = (bookings) => {
  // Seed with the canonical statuses so a chart slot exists even if a
  // status has zero rows. Any unexpected status from old data still shows up.
  const counts = new Map(STATUS_ORDER.map((s) => [s, 0]));
  for (const b of bookings) {
    incrementCount(counts, b.status || "unknown");
  }
  return Array.from(counts, ([name, value]) => ({ name, value }));
};

export const bookingsByDayOfWeek = (bookings) => {
  const counts = new Map(DAY_NAMES.map((d) => [d, 0]));
  for (const b of bookings) {
    if (!b.startDate) continue;
    const d = new Date(b.startDate);
    if (Number.isNaN(d.getTime())) continue;
    incrementCount(counts, DAY_NAMES[d.getDay()]);
  }
  // Preserve Sun→Sat order (don't sort by value).
  return DAY_NAMES.map((name) => ({ name, value: counts.get(name) }));
};

export const kpiSummary = (bookings) => {
  let pending = 0, approved = 0, rejected = 0;
  const resources = new Set();
  const requesters = new Set();

  for (const b of bookings) {
    if (b.status === "pending") pending++;
    else if (b.status === "approved") approved++;
    else if (b.status === "rejected") rejected++;
    if (b.resourceId) resources.add(b.resourceId);
    if (b.requesterId) requesters.add(b.requesterId);
  }

  return {
    total: bookings.length,
    pending,
    approved,
    rejected,
    uniqueResources: resources.size,
    uniqueRequesters: requesters.size
  };
};
