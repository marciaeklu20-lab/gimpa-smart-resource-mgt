// Stage 4j — pure time-bucketing + period-comparison helpers.
//
// Kept separate from the React layer so each role view can compose the
// same logic without re-implementing it. No Firestore, no React — input
// is plain arrays of items + a getTimestamp function, output is the
// shape Recharts expects.

// ---------------------------------------------------------------------
// Date coercion + identity helpers
// ---------------------------------------------------------------------

// Normalize whatever shape an item's timestamp ships in (Firestore
// Timestamp, ISO string, JS Date, epoch millis). Returns Date or null.
export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const startOfDay = (d) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

const startOfWeek = (d) => {
  const out = startOfDay(d);
  // Use Monday as the start of the week — matches most institutional
  // reporting conventions in Ghana / WAEC region. Sunday-as-start would
  // split the working week across two buckets.
  const day = out.getDay();
  const diff = (day + 6) % 7; // Mon=0
  out.setDate(out.getDate() - diff);
  return out;
};

const startOfMonth = (d) => {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
};

const addDays = (d, n) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const addMonths = (d, n) => {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
};

// ---------------------------------------------------------------------
// Bucket size selection
// ---------------------------------------------------------------------

export const BUCKET_DAY = "day";
export const BUCKET_WEEK = "week";
export const BUCKET_MONTH = "month";

export const pickBucketSize = (startDate, endDate) => {
  const days = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  // Per spec: ≤90 → daily, ≤365 → weekly, >365 → monthly.
  if (days <= 90) return BUCKET_DAY;
  if (days <= 365) return BUCKET_WEEK;
  return BUCKET_MONTH;
};

const truncToBucket = (d, size) => {
  if (size === BUCKET_DAY) return startOfDay(d);
  if (size === BUCKET_WEEK) return startOfWeek(d);
  return startOfMonth(d);
};

const advanceBucket = (d, size) => {
  if (size === BUCKET_DAY) return addDays(d, 1);
  if (size === BUCKET_WEEK) return addDays(d, 7);
  return addMonths(d, 1);
};

// ---------------------------------------------------------------------
// formatBucketLabel — short, sortable label per bucket size.
// Recharts XAxis ticks are tight, so keep this concise.
// ---------------------------------------------------------------------

const PAD2 = (n) => String(n).padStart(2, "0");

export const formatBucketLabel = (d, size) => {
  if (size === BUCKET_DAY) {
    return `${PAD2(d.getDate())} ${d.toLocaleString("en-GB", { month: "short" })}`;
  }
  if (size === BUCKET_WEEK) {
    return `W/c ${PAD2(d.getDate())} ${d.toLocaleString("en-GB", { month: "short" })}`;
  }
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
};

const isoKey = (d) =>
  `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}-${PAD2(d.getDate())}`;

// ---------------------------------------------------------------------
// bucketize — main entry point
//
// Args:
//   items:        array of any
//   getTimestamp: function(item) → Date | timestamp-like
//   startDate:    Date — inclusive lower bound
//   endDate:      Date — exclusive-of-next-day upper bound
//   bucketSize:   BUCKET_DAY | BUCKET_WEEK | BUCKET_MONTH (optional —
//                 auto-picked from the range when omitted)
//   series:       optional { key: classifier(item) → string } map. When
//                 present, each bucket additionally carries one numeric
//                 field per series key — useful for stacked bars or
//                 multi-line charts. Items with no classifier match are
//                 still counted in `count`.
//
// Returns:
//   { buckets, bucketSize }
//   where buckets = [{ date, key, label, count, items, ...series }, ...]
// ---------------------------------------------------------------------

export const bucketize = (
  items,
  getTimestamp,
  startDate,
  endDate,
  bucketSize,
  series
) => {

  const size = bucketSize || pickBucketSize(startDate, endDate);
  const start = truncToBucket(startDate, size);
  const end   = truncToBucket(endDate, size);

  const seriesKeys = series ? Object.keys(series) : [];

  // Pre-fill every bucket so the chart x-axis is contiguous even when a
  // bucket has zero items.
  const buckets = [];
  const byKey = new Map();
  let cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = isoKey(cursor);
    const seed = { items: [] };
    for (const k of seriesKeys) seed[k] = 0;
    const b = {
      date:  new Date(cursor),
      key,
      label: formatBucketLabel(cursor, size),
      count: 0,
      ...seed
    };
    buckets.push(b);
    byKey.set(key, b);
    cursor = advanceBucket(cursor, size);
  }

  for (const item of items) {
    const t = toDate(getTimestamp(item));
    if (!t) continue;
    if (t.getTime() < startDate.getTime()) continue;
    if (t.getTime() > endDate.getTime()) continue;

    const bucketStart = truncToBucket(t, size);
    const key = isoKey(bucketStart);
    const b = byKey.get(key);
    if (!b) continue;
    b.count += 1;
    b.items.push(item);

    if (series) {
      for (const sk of seriesKeys) {
        const classifier = series[sk];
        const seriesKey = classifier(item);
        if (seriesKey === sk) b[sk] += 1;
      }
    }
  }

  return { buckets, bucketSize: size };
};

// ---------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------

// Given a current { startDate, endDate }, derive the prior period of
// the same length immediately before it. Used for delta calculations
// (current vs prior 30d, etc.). Both bounds inclusive of their day.
export const priorPeriod = ({ startDate, endDate }) => {
  const lengthMs = endDate.getTime() - startDate.getTime();
  const priorEnd = new Date(startDate.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - lengthMs);
  return { startDate: priorStart, endDate: priorEnd };
};

// Filter items into a period using a timestamp getter. Mirrors the
// bucketize gate so KPI math and chart math see the same set.
export const inPeriod = (items, getTimestamp, { startDate, endDate }) => {
  const lo = startDate.getTime();
  const hi = endDate.getTime();
  const out = [];
  for (const item of items) {
    const t = toDate(getTimestamp(item));
    if (!t) continue;
    const ts = t.getTime();
    if (ts >= lo && ts <= hi) out.push(item);
  }
  return out;
};

// ---------------------------------------------------------------------
// comparePeriods — collapse a metric across current vs prior into a
// renderable delta object. metric() can return any numeric value (count,
// average, percentage).
//
// Returns { current, previous, deltaAbs, deltaPct, direction } where
// direction is "up" | "down" | "flat".
// ---------------------------------------------------------------------

export const comparePeriods = (currentItems, previousItems, metric) => {
  const current = metric(currentItems);
  const previous = metric(previousItems);
  const deltaAbs = (current ?? 0) - (previous ?? 0);

  let deltaPct = null;
  if (previous && Number.isFinite(previous) && previous !== 0) {
    deltaPct = (deltaAbs / Math.abs(previous)) * 100;
  } else if (current === 0 && previous === 0) {
    deltaPct = 0;
  }

  let direction = "flat";
  if (deltaAbs > 0) direction = "up";
  else if (deltaAbs < 0) direction = "down";

  return { current, previous, deltaAbs, deltaPct, direction };
};

// ---------------------------------------------------------------------
// Period presets — used by PeriodSelector and report titles.
// ---------------------------------------------------------------------

const setEndOfDay = (d) => {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
};

const setStartOfDay = (d) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

export const PERIOD_PRESETS = [
  { id: "7",   label: "Last 7 days",   days: 7 },
  { id: "30",  label: "Last 30 days",  days: 30 },
  { id: "90",  label: "Last 90 days",  days: 90 },
  { id: "365", label: "Last 365 days", days: 365 }
];

// Compute a preset's date range relative to a reference date. The
// reference is parametrized so tests can pin "now" without leaking
// wall-clock variance into snapshots.
export const computePresetRange = (presetId, reference) => {
  const preset = PERIOD_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  const now = reference ? new Date(reference) : new Date();
  const endDate = setEndOfDay(now);
  const startDate = setStartOfDay(new Date(now.getTime() - (preset.days - 1) * 24 * 60 * 60 * 1000));
  return { startDate, endDate, label: preset.label, id: presetId };
};

// Custom-range builder used by PeriodSelector when the user picks
// arbitrary From/To dates.
export const buildCustomRange = (fromYmd, toYmd) => {
  if (!fromYmd || !toYmd) return null;
  const start = new Date(fromYmd);
  const end = new Date(toYmd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return {
    startDate: setStartOfDay(start),
    endDate:   setEndOfDay(end),
    label:     `${fromYmd} to ${toYmd}`,
    id:        "custom"
  };
};

export const formatRangeISO = (d) => {
  const yyyy = d.getFullYear();
  const mm = PAD2(d.getMonth() + 1);
  const dd = PAD2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
};
