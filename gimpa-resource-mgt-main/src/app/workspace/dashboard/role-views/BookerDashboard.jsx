"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { relativeTime } from "@/app/lib/resourceMeta";

const db = getFirestore(app);

const STATUS_LABEL = {
  pending:      "Pending",
  approved:     "Approved",
  rejected:     "Rejected",
  acknowledged: "Acknowledged",
  in_progress:  "In progress",
  resolved:     "Resolved",
  closed:       "Closed"
};

// Booking is considered "active" when it's approved AND its end has
// not yet passed. Bookings can store the end as either an ISO string
// or a Firestore Timestamp depending on Stage; tolerate both so
// legacy + new docs both count correctly.
const bookingIsActive = (b, nowMs) => {
  if (b.status !== "approved") return false;
  const end = b.endDate ?? b.endsAt ?? null;
  if (!end) return true;
  if (typeof end === "string") {
    const t = new Date(end).getTime();
    return Number.isFinite(t) ? t >= nowMs : true;
  }
  if (typeof end?.toMillis === "function") {
    return end.toMillis() >= nowMs;
  }
  return true;
};

// Stage 4g.1: shared start/end parser. Bookings written by BookingForm
// store dates as ISO strings (.toISOString()), but legacy / future
// callers may use Firestore Timestamps. Returns a JS Date or null.
const parseBookingDate = (val) => {
  if (!val) return null;
  if (typeof val === "string") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val?.toMillis === "function") {
    return new Date(val.toMillis());
  }
  if (val instanceof Date) return val;
  return null;
};

const startOfLocalDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const sameLocalDay = (a, b) =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

const weekdayShort = (d) =>
  d.toLocaleDateString("en-GB", { weekday: "short" });

const formatTimeHM = (d) =>
  d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

// "Today" / "Tomorrow" / "Mon 9" — used as the compact date badge in
// the Upcoming-this-week list.
const dateBadgeFor = (d, nowDate) => {
  const today = startOfLocalDay(nowDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameLocalDay(d, today)) return "Today";
  if (sameLocalDay(d, tomorrow)) return "Tomorrow";
  return `${weekdayShort(d)} ${d.getDate()}`;
};

// Avatar letter for the resource-of-interest card. Resources have no
// thumbnail field in the schema yet — keep a single source for the
// initial so future thumbnail support can switch the card body
// without redesigning the fallback.
const initialFor = (name) => {
  if (!name) return "?";
  const trimmed = String(name).trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
};

export default function BookerDashboard({ currentUser, navigate }) {

  const uid = currentUser?.uid;

  const [bookings, setBookings] = useState([]);
  const [faults, setFaults] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  // Live own-bookings: the requesterId == auth.uid branch of the
  // Firestore rules permits this on the auto-indexed single-field
  // query — no composite index needed.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "bookings"),
        where("requesterId", "==", uid)
      ),
      (snap) => setBookings(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("BookerDashboard bookings listener:", err)
    );
    return () => unsub();
  }, [uid]);

  // Live own-faults — same pattern; the reporter rule branch covers
  // it without any new index.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        collection(db, "faults"),
        where("reporterId", "==", uid)
      ),
      (snap) => setFaults(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ),
      (err) => console.error("BookerDashboard faults listener:", err)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const activeCount = useMemo(
    () => bookings.filter((b) => bookingIsActive(b, now)).length,
    [bookings, now]
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending").length,
    [bookings]
  );

  // Group faults by status so the breakdown line under "My faults"
  // tells the booker what's outstanding without clicking through.
  const faultStatusCounts = useMemo(() => {
    const totals = { pending: 0, in_progress: 0, resolved: 0, other: 0 };
    for (const f of faults) {
      if (f.status === "pending" || f.status === "acknowledged") {
        totals.pending += 1;
      } else if (f.status === "in_progress") {
        totals.in_progress += 1;
      } else if (f.status === "resolved") {
        totals.resolved += 1;
      } else {
        totals.other += 1;
      }
    }
    return totals;
  }, [faults]);

  // Stage 4g.1 — Upcoming approved bookings starting in the next 7
  // days (inclusive of today, exclusive of day +7). Sorted ascending
  // so the next event is on top. now ticks every 30s so the "Today"
  // badge correctly rolls into "Tomorrow" at midnight without a
  // refetch.
  const upcomingThisWeek = useMemo(() => {
    const nowDate = new Date(now);
    const todayStart = startOfLocalDay(nowDate);
    const windowEnd = new Date(todayStart);
    windowEnd.setDate(windowEnd.getDate() + 7);

    return bookings
      .filter((b) => b.status === "approved")
      .map((b) => ({
        booking: b,
        start: parseBookingDate(b.startDate ?? b.startsAt),
        end: parseBookingDate(b.endDate ?? b.endsAt)
      }))
      .filter(({ start }) =>
        start && start >= todayStart && start < windowEnd
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [bookings, now]);

  const upcomingTop = useMemo(
    () => upcomingThisWeek.slice(0, 5),
    [upcomingThisWeek]
  );
  const hasMoreUpcoming = upcomingThisWeek.length > 5;

  // Stage 4g.1 — Resources-of-interest: top 5 resources by booking
  // frequency across MY bookings (any status, any time). Ties broken
  // by most-recent booking start, so a recurring favourite beats an
  // equally-frequent stale one.
  const topResources = useMemo(() => {
    const groups = new Map();
    for (const b of bookings) {
      if (!b.resourceId) continue;
      const existing = groups.get(b.resourceId) || {
        resourceId: b.resourceId,
        resourceName: b.resourceName || b.resourceId,
        count: 0,
        maxStartMs: 0
      };
      existing.count += 1;
      const startMs = parseBookingDate(b.startDate ?? b.startsAt)?.getTime() || 0;
      if (startMs > existing.maxStartMs) {
        existing.maxStartMs = startMs;
      }
      groups.set(b.resourceId, existing);
    }
    return [...groups.values()]
      .sort((a, b) =>
        b.count - a.count
        || b.maxStartMs - a.maxStartMs
      )
      .slice(0, 5);
  }, [bookings]);

  // Hydrate the top-5 with their live resource docs so the cards can
  // show the canonical name + category. Cache is keyed on resourceId
  // and persists across renders via a ref — we never re-fetch an id
  // we've already loaded. Five reads max per session.
  const resourceCacheRef = useRef({});
  const [hydratedResources, setHydratedResources] = useState({});

  useEffect(() => {
    const missing = topResources
      .map((r) => r.resourceId)
      .filter((id) => !resourceCacheRef.current[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, "resources", id));
        return [id, snap.exists() ? snap.data() : { __missing: true }];
      } catch (err) {
        console.error("BookerDashboard resource hydrate failed:", id, err);
        return [id, { __missing: true }];
      }
    })).then((entries) => {
      if (cancelled) return;
      const next = { ...resourceCacheRef.current };
      for (const [id, data] of entries) next[id] = data;
      resourceCacheRef.current = next;
      setHydratedResources(next);
    });

    return () => { cancelled = true; };
  }, [topResources]);

  // Recent resources I've booked: the last 5 distinct resourceIds
  // from MY bookings, ordered by booking createdAt. Click navigates
  // to the asset's detail in Resource Management.
  const recentResources = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      const ams = a.createdAt?.toMillis?.() || 0;
      const bms = b.createdAt?.toMillis?.() || 0;
      return bms - ams;
    });
    const seen = new Set();
    const out = [];
    for (const b of sorted) {
      if (!b.resourceId || seen.has(b.resourceId)) continue;
      seen.add(b.resourceId);
      out.push({
        resourceId: b.resourceId,
        resourceName: b.resourceName || b.resourceId,
        lastBookedAt: b.createdAt
      });
      if (out.length >= 5) break;
    }
    return out;
  }, [bookings]);

  // Activity feed: own bookings (any status) and own faults, merged
  // and sorted. Booking actions are surfaced via status + timestamp;
  // faults via severity + status.
  const activity = useMemo(() => {
    const items = [];
    for (const b of bookings) {
      items.push({
        kind: "booking",
        id: `b-${b.id}`,
        title: b.purpose || b.resourceName || "Booking",
        subtitle:
          `${b.resourceName || b.resourceId || "Resource"}`
          + ` · ${STATUS_LABEL[b.status] || b.status}`,
        timestamp: b.createdAt,
        onClick: () => navigate?.({
          sidebar: "Resource Management",
          tab: "Bookings",
          expandedId: b.id
        })
      });
    }
    for (const f of faults) {
      items.push({
        kind: "fault",
        id: `f-${f.id}`,
        title: f.resourceName || "Fault",
        subtitle: `${f.severity} · ${STATUS_LABEL[f.status] || f.status}`,
        timestamp: f.createdAt,
        onClick: () => navigate?.({ faultId: f.id })
      });
    }
    return items
      .sort((a, b) => {
        const ams = a.timestamp?.toMillis?.() || 0;
        const bms = b.timestamp?.toMillis?.() || 0;
        return bms - ams;
      })
      .slice(0, 10);
  }, [bookings, faults, navigate]);

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  return (

    <div className="dashboard-container">

      <div className="dashboard-header dashboard-header-with-action">
        <div>
          <h1 className="dashboard-greeting">Welcome, {firstName}</h1>
          <p className="dashboard-subtitle">
            Your bookings, faults you&apos;ve reported, and what to do next.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-quick-action"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Campus Resources"
          })}
        >
          + New booking
        </button>
      </div>

      <div className="dashboard-rm-kpi-strip">

        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "approved" }
          })}
        >
          <div className="dashboard-kpi-label">My active bookings</div>
          <div className="dashboard-kpi-value">{activeCount}</div>
          <div className="dashboard-kpi-sub">
            {activeCount === 0
              ? "No active bookings."
              : "Approved + still upcoming."}
          </div>
        </button>

        <button
          type="button"
          className="dashboard-kpi-card"
          onClick={() => navigate?.({
            sidebar: "Resource Management",
            tab: "Bookings",
            filter: { status: "pending" }
          })}
        >
          <div className="dashboard-kpi-label">My pending bookings</div>
          <div className="dashboard-kpi-value">{pendingCount}</div>
          <div className="dashboard-kpi-sub">
            {pendingCount === 0
              ? "Nothing waiting on approvers."
              : "Waiting on approvers."}
          </div>
        </button>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Faults I&apos;ve reported</div>
          <div className="dashboard-kpi-value">{faults.length}</div>
          <ul className="dashboard-kpi-breakdown">
            {faultStatusCounts.pending > 0 && (
              <li><span>Pending</span><span>{faultStatusCounts.pending}</span></li>
            )}
            {faultStatusCounts.in_progress > 0 && (
              <li><span>In progress</span><span>{faultStatusCounts.in_progress}</span></li>
            )}
            {faultStatusCounts.resolved > 0 && (
              <li><span>Resolved</span><span>{faultStatusCounts.resolved}</span></li>
            )}
            {faults.length === 0 && (
              <li className="dashboard-kpi-empty">No reports yet.</li>
            )}
          </ul>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-label">Recent resources I&apos;ve booked</div>
          {recentResources.length === 0 ? (
            <div className="dashboard-kpi-empty">
              You haven&apos;t booked anything yet.
            </div>
          ) : (
            <ul className="dashboard-resource-list">
              {recentResources.map((r) => (
                <li key={r.resourceId}>
                  <button
                    type="button"
                    className="dashboard-resource-row"
                    onClick={() => navigate?.({
                      sidebar: "Resource Management",
                      tab: "Campus Resources",
                      assetId: r.resourceId
                    })}
                  >
                    <span className="dashboard-resource-name">
                      {r.resourceName}
                    </span>
                    <span className="dashboard-resource-time">
                      {r.lastBookedAt ? relativeTime(r.lastBookedAt, now) : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Stage 4g.1 — Upcoming approved bookings in the next 7 days.
          Compact rows so the section never dominates the page; the
          rest of the user's bookings are still one click away via
          the My-Bookings KPI card above. */}
      <section className="dashboard-section booker-upcoming-section">
        <div className="booker-section-header">
          <h2 className="dashboard-section-title">Upcoming bookings this week</h2>
          {hasMoreUpcoming && (
            <button
              type="button"
              className="booker-section-link"
              onClick={() => navigate?.({
                sidebar: "Resource Management",
                tab: "Bookings",
                filter: { status: "approved" }
              })}
            >
              View all upcoming →
            </button>
          )}
        </div>

        {upcomingTop.length === 0 ? (
          <div className="dashboard-empty-card booker-empty-state">
            <span>No bookings this week.</span>
            <button
              type="button"
              className="booker-empty-link"
              onClick={() => navigate?.({
                sidebar: "Resource Management",
                tab: "Campus Resources"
              })}
            >
              Browse campus resources →
            </button>
          </div>
        ) : (
          <ul className="booker-upcoming-list">
            {upcomingTop.map(({ booking, start, end }) => (
              <li key={booking.id}>
                <button
                  type="button"
                  className="booker-upcoming-row"
                  onClick={() => navigate?.({
                    sidebar: "Resource Management",
                    tab: "Campus Resources",
                    assetId: booking.resourceId
                  })}
                >
                  <span className="booker-upcoming-date-badge">
                    {dateBadgeFor(start, new Date(now))}
                  </span>
                  <span className="booker-upcoming-time">
                    {formatTimeHM(start)}
                    {end ? ` – ${formatTimeHM(end)}` : ""}
                  </span>
                  <span className="booker-upcoming-resource">
                    {booking.resourceName || booking.resourceId}
                  </span>
                  <span className={`booker-upcoming-status booker-status-${booking.status}`}>
                    {STATUS_LABEL[booking.status] || booking.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stage 4g.1 — Resources of interest: the 5 resources the
          booker uses most, surfaced as quick-rebook tiles. Cards
          link to the asset's detail page; the "Book again" button
          is the explicit affordance — modal pre-fill is Future Work. */}
      <section className="dashboard-section booker-resources-section">
        <h2 className="dashboard-section-title">Resources of interest</h2>

        {topResources.length === 0 ? (
          <div className="dashboard-empty-card booker-empty-state">
            <span>You haven&apos;t booked any resources yet.</span>
            <button
              type="button"
              className="booker-empty-link"
              onClick={() => navigate?.({
                sidebar: "Resource Management",
                tab: "Campus Resources"
              })}
            >
              Browse campus resources →
            </button>
          </div>
        ) : (
          <div className="booker-resource-grid">
            {topResources.map((r) => {
              const live = hydratedResources[r.resourceId];
              const displayName =
                (live && !live.__missing && live.resourceName)
                || r.resourceName;
              const category =
                (live && !live.__missing && live.category) || null;
              return (
                <div className="booker-resource-card" key={r.resourceId}>
                  <div className="booker-resource-card-image" aria-hidden>
                    {initialFor(displayName)}
                  </div>
                  <div className="booker-resource-card-name">
                    {displayName}
                  </div>
                  <div className="booker-resource-card-category">
                    {category || "—"}
                  </div>
                  <div className="booker-resource-card-badge">
                    Booked {r.count} time{r.count === 1 ? "" : "s"}
                  </div>
                  <button
                    type="button"
                    className="booker-resource-card-button"
                    onClick={() => navigate?.({
                      sidebar: "Resource Management",
                      tab: "Campus Resources",
                      assetId: r.resourceId
                    })}
                  >
                    Book again
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <div className="dashboard-empty-card">
            Once you submit a booking or report a fault, it&apos;ll show
            up here.
          </div>
        ) : (
          <ul className="dashboard-activity-list">
            {activity.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="dashboard-activity-row"
                  onClick={item.onClick}
                >
                  <span
                    className={`dashboard-activity-kind dashboard-activity-kind-${item.kind}`}
                  >
                    {item.kind === "booking" ? "Booking" : "Fault"}
                  </span>
                  <span className="dashboard-activity-title">
                    {item.title}
                  </span>
                  <span className="dashboard-activity-sub">
                    {item.subtitle}
                  </span>
                  <span className="dashboard-activity-time">
                    {item.timestamp ? relativeTime(item.timestamp, now) : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
