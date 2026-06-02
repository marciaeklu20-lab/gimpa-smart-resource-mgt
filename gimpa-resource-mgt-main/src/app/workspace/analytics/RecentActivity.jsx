"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { Calendar, CheckCircle2, XCircle, UserPlus } from "lucide-react";

import "@/app/styles/analytics/recent-activity.css";

const db = getFirestore(app);

const MAX_FEED = 15;

// "Just now" / "X minutes ago" / "X hours ago" / "X days ago".
// `now` is passed in so the component can re-render every 15s and the
// strings stay current without re-fetching from Firestore.
const formatRelativeTime = (timestamp, now) => {

  if (!timestamp?.toMillis) return "";

  const ms = now - timestamp.toMillis();
  // serverTimestamp() can briefly read as future-tense due to client
  // clock skew — treat as just-now rather than showing "in 4 seconds".
  if (ms < 0) return "just now";

  const seconds = Math.floor(ms / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;

};

const iconFor = (type) => {
  switch (type) {
    case "created": return <Calendar size={18} />;
    case "approved": return <CheckCircle2 size={18} />;
    case "rejected": return <XCircle size={18} />;
    case "user": return <UserPlus size={18} />;
    default: return null;
  }
};

export default function RecentActivity({ navigate } = {}) {

  const [created, setCreated] = useState([]);
  const [approved, setApproved] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [users, setUsers] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  // Four parallel listeners. The merge happens in `events` below.
  // All four unsubscribes are returned in a single cleanup so React
  // tears them all down on unmount / dep change.
  useEffect(() => {

    const unsubs = [];

    // 1. New booking creations.
    unsubs.push(onSnapshot(
      query(
        collection(db, "bookings"),
        orderBy("createdAt", "desc"),
        limit(10)
      ),
      (snap) => {
        setCreated(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    ));

    // 2. Recent approvals. Firestore can't combine two orderBys cleanly
    // (approvedAt + rejectedAt), so we split into two listeners and
    // merge client-side.
    unsubs.push(onSnapshot(
      query(
        collection(db, "bookings"),
        where("status", "==", "approved"),
        orderBy("approvedAt", "desc"),
        limit(5)
      ),
      (snap) => {
        setApproved(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    ));

    // 3. Recent rejections (pair with #2).
    unsubs.push(onSnapshot(
      query(
        collection(db, "bookings"),
        where("status", "==", "rejected"),
        orderBy("rejectedAt", "desc"),
        limit(5)
      ),
      (snap) => {
        setRejected(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    ));

    // 4. New user signups.
    unsubs.push(onSnapshot(
      query(
        collection(db, "users"),
        orderBy("createdAt", "desc"),
        limit(5)
      ),
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    ));

    return () => {
      unsubs.forEach((u) => u());
    };

  }, []);

  // Re-render every 15s so "5 minutes ago" → "6 minutes ago" without
  // any Firestore traffic.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const events = useMemo(() => {

    const map = new Map();

    // Distinct keys per (eventType, docId) so an "approved" event and a
    // "created" event on the same booking can both appear.
    for (const b of created) {
      if (!b.createdAt?.toMillis) continue;
      map.set(`created:${b.id}`, {
        key: `created:${b.id}`,
        type: "created",
        bookingId: b.id,
        timestamp: b.createdAt,
        headline: `${b.requesterName || "Someone"} booked ${b.resourceName || "a resource"}`,
        actorRole: b.requesterRole || null
      });
    }

    for (const b of approved) {
      if (!b.approvedAt?.toMillis) continue;
      const actor = b.approvedBy?.name || "An admin";
      map.set(`approved:${b.id}`, {
        key: `approved:${b.id}`,
        type: "approved",
        bookingId: b.id,
        timestamp: b.approvedAt,
        headline: `${actor} approved a booking for ${b.resourceName || "a resource"}`,
        actorRole: b.approvedBy?.role || null
      });
    }

    for (const b of rejected) {
      if (!b.rejectedAt?.toMillis) continue;
      const actor = b.rejectedBy?.name || "An admin";
      map.set(`rejected:${b.id}`, {
        key: `rejected:${b.id}`,
        type: "rejected",
        bookingId: b.id,
        timestamp: b.rejectedAt,
        headline: `${actor} rejected a booking for ${b.resourceName || "a resource"}`,
        actorRole: b.rejectedBy?.role || null
      });
    }

    for (const u of users) {
      if (!u.createdAt?.toMillis) continue;
      const name = u.fullName || u.email || "A new user";
      map.set(`user:${u.id}`, {
        key: `user:${u.id}`,
        type: "user",
        userId: u.id,
        timestamp: u.createdAt,
        headline: `${name} signed up`,
        actorRole: u.role || null
      });
    }

    return [...map.values()]
      .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
      .slice(0, MAX_FEED);

  }, [created, approved, rejected, users]);

  return (

    <div className="recent-activity">

      <div className="recent-activity-header">
        <h3>Recent Activity</h3>
        <span
          className="recent-activity-live-dot"
          title="Live feed — updates in real time"
        />
      </div>

      {events.length === 0 ? (

        <div className="recent-activity-empty">
          No activity yet.
        </div>

      ) : (

        <ul className="recent-activity-list">

          {events.map((event) => {

            // Dispatch click → navigate intent. User-signup events jump
            // to the Admin Dashboard's Approvals tab; all booking events
            // (created / approved / rejected) jump to the Bookings tab
            // with that booking's row pre-expanded.
            const handleClick = navigate
              ? () => {
                  if (event.type === "user") {
                    // Sidebar default-routes Admin Dashboard to its
                    // pending-approvals view, so no `tab` is needed.
                    navigate({ sidebar: "Admin Dashboard" });
                  } else {
                    navigate({
                      sidebar: "Resource Management",
                      tab: "Bookings",
                      expandedId: event.bookingId
                    });
                  }
                }
              : undefined;

            const handleKeyDown = handleClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick();
                  }
                }
              : undefined;

            return (

              <li
                key={event.key}
                className={`activity-item activity-item-${event.type} ${handleClick ? "activity-item-clickable" : ""}`}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role={handleClick ? "button" : undefined}
                tabIndex={handleClick ? 0 : undefined}
              >

                <div className="activity-icon">
                  {iconFor(event.type)}
                </div>

                <div className="activity-body">

                  <div className="activity-headline">
                    {event.headline}
                  </div>

                  {event.actorRole && (
                    <div className="activity-actor">
                      <span className="activity-actor-role">
                        {event.actorRole}
                      </span>
                    </div>
                  )}

                </div>

                <div className="activity-time">
                  {formatRelativeTime(event.timestamp, now)}
                </div>

              </li>

            );

          })}

        </ul>

      )}

    </div>

  );

}
