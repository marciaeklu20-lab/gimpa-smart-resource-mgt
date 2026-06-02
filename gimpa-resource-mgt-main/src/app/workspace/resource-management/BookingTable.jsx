"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  approveBooking
} from "./services/approveBooking";

import {
  rejectBooking
} from "./services/rejectBooking";

import { isUnread } from "./services/isUnread";

import BookingChat from "./BookingChat";

import "@/app/styles/resource-management/booking-table.css";

const formatDateRange = (start, end) => {
  if (!start || !end) return "—";
  const fmt = (s) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  return `${fmt(start)} → ${fmt(end)}`;
};

// Human-readable label for an active filter chip. Kept in sync with the
// shape produced by Dashboard stat cards (status | dateKey).
const describeFilter = (filter) => {
  if (!filter) return null;
  if (filter.status) {
    return `Status: ${filter.status}`;
  }
  if (filter.dateKey) {
    return `Date: ${filter.dateKey}`;
  }
  return null;
};

export default function BookingTable({
  bookings,
  currentUser,
  initialFilter = null,
  initialExpandedId = null
}) {

  // Filter + expandedId are seeded from the navigation intent passed
  // down by page.jsx, then become user-controlled locally (the × on the
  // filter chip clears; clicking a row toggles expansion). A useEffect
  // re-syncs whenever a fresh intent arrives — page.jsx always passes a
  // new object reference so this fires even on identical filters.
  const [filter, setFilter] = useState(initialFilter);
  const [expandedId, setExpandedId] = useState(initialExpandedId);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    setExpandedId(initialExpandedId);
  }, [initialExpandedId]);

  // Scroll the expanded row into view once it lands on the DOM. The
  // rAF defer gives React a paint cycle to mount the row before we
  // measure its position; without it the scroll happens against the
  // pre-expansion layout and lands short.
  const expandedRowRef = useRef(null);
  useEffect(() => {
    if (!expandedId) return;
    const raf = requestAnimationFrame(() => {
      expandedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [expandedId]);

  const handleApprove = async (bookingId) => {
    try {
      await approveBooking(bookingId, currentUser);
    } catch (error) {
      console.error(error);
    }
  };

  const handleReject = async (bookingId) => {
    try {
      await rejectBooking(bookingId, currentUser);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleExpanded = (booking, e) => {
    // Don't toggle when clicking action buttons inside the row.
    if (e.target.closest("button")) return;
    setExpandedId((prev) => (prev === booking.id ? null : booking.id));
  };

  const visibleBookings = useMemo(() => {
    if (!bookings) return [];
    if (!filter) return bookings;
    if (filter.status) {
      return bookings.filter((b) => b.status === filter.status);
    }
    if (filter.dateKey) {
      return bookings.filter(
        (b) => typeof b.startDate === "string" && b.startDate.startsWith(filter.dateKey)
      );
    }
    return bookings;
  }, [bookings, filter]);

  const filterLabel = describeFilter(filter);

  return (

    <div className="booking-table-wrapper">

      {filterLabel && (
        <div className="booking-filter-bar">
          <span className="booking-filter-chip">
            {filterLabel}
            <button
              type="button"
              className="booking-filter-chip-clear"
              onClick={() => setFilter(null)}
              aria-label="Clear filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {visibleBookings.length === 0 ? (

        <div className="booking-table-empty">
          {filter ? "No bookings match this filter." : "No bookings to show."}
        </div>

      ) : (

        <table className="booking-table">

          <thead>

            <tr>
              <th>Resource</th>
              <th>Requester</th>
              <th>Role</th>
              <th>Department</th>
              <th>Purpose</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>

          </thead>

          <tbody>

            {visibleBookings.map((booking) => {

              const isExpanded = expandedId === booking.id;

              return (

                <Fragment key={booking.id}>

                  <tr
                    data-booking-id={booking.id}
                    ref={isExpanded ? expandedRowRef : null}
                    className={`booking-row ${isExpanded ? "expanded" : ""}`}
                    onClick={(e) => toggleExpanded(booking, e)}
                  >

                    <td>
                      {booking.resourceName}
                      {isUnread(booking, currentUser) && (
                        <span className="booking-row-unread-badge">
                          NEW
                        </span>
                      )}
                    </td>
                    <td>{booking.requesterName}</td>
                    <td>{booking.requesterRole}</td>
                    <td>{booking.requesterDepartment || "-"}</td>
                    <td>{booking.purpose}</td>
                    <td>{booking.status}</td>

                    <td>

                      {booking.status === "pending" && booking.requesterId !== currentUser?.uid && (

                        <div className="booking-actions">

                          <button
                            className="approve-btn"
                            onClick={() => handleApprove(booking.id)}
                          >
                            Approve
                          </button>

                          <button
                            className="reject-btn"
                            onClick={() => handleReject(booking.id)}
                          >
                            Reject
                          </button>

                        </div>

                      )}

                    </td>

                  </tr>

                  {isExpanded && (

                    <tr className="booking-row-expanded">

                      <td colSpan={7}>

                        <div className="booking-details">

                          <div className="booking-details-grid">
                            <div>
                              <span className="booking-details-label">When</span>
                              <span className="booking-details-value">
                                {formatDateRange(booking.startDate, booking.endDate)}
                              </span>
                            </div>
                            <div>
                              <span className="booking-details-label">Requester email</span>
                              <span className="booking-details-value">
                                {booking.requesterEmail || "—"}
                              </span>
                            </div>
                            <div>
                              <span className="booking-details-label">Approval route</span>
                              <span className="booking-details-value">
                                {booking.approvalRoute || "—"}
                              </span>
                            </div>
                          </div>

                          <BookingChat
                            bookingId={booking.id}
                            currentUser={currentUser}
                          />

                        </div>

                      </td>

                    </tr>

                  )}

                </Fragment>

              );

            })}

          </tbody>

        </table>

      )}

    </div>

  );

}
