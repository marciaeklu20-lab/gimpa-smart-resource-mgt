// Stage 4p — compact context payload builder for the AI availability
// bot. Pure function: takes the data the bot panel already has
// subscribed (resources, bookings, faults) plus the current user, and
// returns a compact, PII-scrubbed object (target: under 5 KB JSON).
//
// PRIVACY: this is the single chokepoint that decides what leaves the
// browser for Groq. It MUST NOT emit any individual user identifiers —
// no requester/reporter/custodian names, emails, or uids. Refer to
// bookings and faults by resource and time only.

const MAX_RESOURCES = 60;
const MAX_BOOKINGS = 80;
const MAX_FAULTS = 20;

const UPCOMING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// High-utility resource keywords. Resources whose category/type/name
// hint at one of these get prioritized into the context when we're over
// the cap — these are the things people actually ask "is X free?" about.
const HIGH_UTILITY = ["lab", "vehicle", "car", "bus", "van", "room", "meeting", "hall", "auditorium", "projector"];

// Treat a missing lifecycleStatus as "active" — legacy resources created
// before Stage 4a have no such field (mirrors isBookable()).
const isActive = (r) => (r?.lifecycleStatus || "active") === "active";

const parseTime = (value) => {
  if (!value) return null;
  // Firestore Timestamp → millis
  if (typeof value === "object" && typeof value.toMillis === "function") {
    try { return value.toMillis(); } catch { return null; }
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    try { return value.toDate().getTime(); } catch { return null; }
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const toIso = (value) => {
  const t = parseTime(value);
  return t == null ? null : new Date(t).toISOString();
};

const utilityScore = (r) => {
  const hay = `${r?.category || ""} ${r?.type || ""} ${r?.resourceName || ""}`.toLowerCase();
  return HIGH_UTILITY.some((kw) => hay.includes(kw)) ? 1 : 0;
};

export function buildBotContext({ resources = [], bookings = [], faults = [] } = {}, currentUser) {
  const nowMs = Date.now();
  const uid = currentUser?.uid || null;

  // --- Resource ids the current user has touched (own bookings/faults)
  // so we can surface those first. We compare against uid locally; the
  // ids themselves are resourceIds (not user PII) so they're safe to
  // serialize.
  const touched = new Set();
  for (const b of bookings) {
    if (uid && b?.requesterId === uid && b?.resourceId) touched.add(b.resourceId);
  }
  for (const f of faults) {
    if (uid && f?.reporterId === uid && f?.resourceId) touched.add(f.resourceId);
  }

  // --- Resources: active only, prioritized (touched → high-utility →
  // rest), capped at 60.
  const activeResources = (resources || []).filter(isActive);
  const ranked = activeResources
    .map((r, idx) => ({
      r,
      idx,
      score: (touched.has(r?.assetCode) ? 2 : 0) + utilityScore(r)
    }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .slice(0, MAX_RESOURCES)
    .map(({ r }) => ({
      assetCode: r.assetCode || r.id || null,
      name: r.resourceName || null,
      category: r.category || null,
      type: r.type || null,
      location: {
        campus: r.location?.campus || null,
        building: r.location?.building || null,
        floor: r.location?.floor || null,
        room: r.location?.room || null
      },
      capacity: r.capacity ?? null,
      condition: r.condition || null,
      lifecycleStatus: r.lifecycleStatus || "active"
    }));

  // --- Upcoming bookings: within the next 30 days, still current or
  // future, capped at 80, soonest first. PII fields (requesterName,
  // requesterEmail, requesterId) are deliberately dropped.
  const upcomingBookings = (bookings || [])
    .map((b) => ({
      b,
      startMs: parseTime(b?.startDate),
      endMs: parseTime(b?.endDate)
    }))
    .filter(({ startMs, endMs }) => {
      if (startMs == null) return false;
      // Keep anything that ends in the future (or has no end) and starts
      // within the 30-day window.
      const endsInFuture = endMs == null ? startMs >= nowMs : endMs >= nowMs;
      return endsInFuture && startMs <= nowMs + UPCOMING_WINDOW_MS;
    })
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_BOOKINGS)
    .map(({ b }) => ({
      resourceId: b.resourceId || null,
      start: toIso(b.startDate),
      end: toIso(b.endDate),
      status: b.status || null,
      purpose: typeof b.purpose === "string" ? b.purpose.slice(0, 120) : null
    }));

  // --- Open faults: anything not resolved, capped at 20, newest first.
  // Reporter PII (reporterName, reporterEmail, reporterId) is dropped.
  const openFaults = (faults || [])
    .filter((f) => f?.status && f.status !== "resolved")
    .map((f) => ({ f, ts: parseTime(f?.createdAt || f?.reportedAt) || 0 }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_FAULTS)
    .map(({ f }) => ({
      resourceId: f.resourceId || null,
      severity: f.severity || null,
      status: f.status || null,
      reportedAt: toIso(f.createdAt || f.reportedAt)
    }));

  return {
    currentDateTime: new Date(nowMs).toISOString(),
    resources: ranked,
    upcomingBookings,
    openFaults
  };
}
