// Resource lifecycle + condition enums.
//
// Mirrored manually in scripts/seedDemoData.js — keep in sync.

export const LIFECYCLE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "in_maintenance", label: "In maintenance" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
  { value: "lost", label: "Lost" }
];

export const CONDITIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "out_of_service", label: "Out of service" }
];

export const DEFAULT_LIFECYCLE_STATUS = "active";
export const DEFAULT_CONDITION = "good";

export const isBookable = (resource) => {
  // Resources written before Stage 4a have no lifecycleStatus — treat
  // as active (the default for legacy records).
  const status = resource?.lifecycleStatus || DEFAULT_LIFECYCLE_STATUS;
  return status === "active";
};

export const lifecycleLabel = (value) => {
  return LIFECYCLE_STATUSES.find((s) => s.value === value)?.label || value;
};

export const conditionLabel = (value) => {
  return CONDITIONS.find((c) => c.value === value)?.label || value;
};

// ---------------------------------------------------------------------
// Stage 4b display helpers
// ---------------------------------------------------------------------

export const formatLocation = (location) => {
  if (!location || typeof location !== "object") return "—";
  const parts = ["campus", "building", "floor", "room"]
    .map((k) => (location[k] || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" › ") : "—";
};

export const conditionPillStyle = (condition) => {
  switch (condition) {
    case "excellent": return "pill-condition-excellent";
    case "good": return "pill-condition-good";
    case "fair": return "pill-condition-fair";
    case "poor": return "pill-condition-poor";
    case "out_of_service": return "pill-condition-out-of-service";
    default: return "pill-condition-good";
  }
};

export const lifecyclePillStyle = (status) => {
  switch (status) {
    case "active": return "pill-lifecycle-active";
    case "in_maintenance": return "pill-lifecycle-in-maintenance";
    case "retired": return "pill-lifecycle-retired";
    case "disposed": return "pill-lifecycle-disposed";
    case "lost": return "pill-lifecycle-lost";
    default: return "pill-lifecycle-active";
  }
};

export const formatCurrency = (amount) => {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `GHS ${n.toLocaleString("en-GB")}`;
};

// Normalize a date-like value (Firestore Timestamp, JS Date, or
// ISO/yyyy-mm-dd string) to a Date instance. Returns null when input
// is missing or unparseable.
const toDate = (value) => {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateShort = (d) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const formatDate = (value) => {
  const d = toDate(value);
  return d ? formatDateShort(d) : "—";
};

// Returns { label, expired } so the caller can apply red styling when
// the warranty has lapsed.
export const formatWarrantyStatus = (expiryDate, nowMs = Date.now()) => {
  const d = toDate(expiryDate);
  if (!d) return { label: "—", expired: false };
  const expired = d.getTime() < nowMs;
  return {
    label: expired
      ? `Expired (${formatDateShort(d)})`
      : `Valid until ${formatDateShort(d)}`,
    expired
  };
};

// "just now" / "X minutes ago" / "X hours ago" / "X days ago" / date.
// Mirrors the formatter in RecentActivity; accepts Firestore Timestamp,
// JS Date, or epoch-millis.
export const relativeTime = (value, nowMs = Date.now()) => {
  const d = toDate(value);
  if (!d) return "";
  const ms = nowMs - d.getTime();
  // serverTimestamp() can briefly read future-tense due to client clock
  // skew — treat as just-now rather than showing "in 4 seconds".
  if (ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDateShort(d);
};
