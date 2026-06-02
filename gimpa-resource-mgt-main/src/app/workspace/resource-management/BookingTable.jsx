"use client";

import { Fragment, useState } from "react";

import {
  approveBooking
} from "./services/approveBooking";

import {
  rejectBooking
} from "./services/rejectBooking";

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

export default function BookingTable({
  bookings,
  currentUser,
  refreshBookings
}) {

  const [expandedId, setExpandedId] = useState(null);

  const handleApprove = async (bookingId) => {
    try {
      await approveBooking(bookingId, currentUser);
      refreshBookings();
    } catch (error) {
      console.error(error);
    }
  };

  const handleReject = async (bookingId) => {
    try {
      await rejectBooking(bookingId, currentUser);
      refreshBookings();
    } catch (error) {
      console.error(error);
    }
  };

  const toggleExpanded = (booking, e) => {
    // Don't toggle when clicking action buttons inside the row.
    if (e.target.closest("button")) return;
    setExpandedId((prev) => (prev === booking.id ? null : booking.id));
  };

  if (!bookings || bookings.length === 0) {
    return (
      <div className="booking-table-wrapper">
        <div className="booking-table-empty">
          No bookings to show.
        </div>
      </div>
    );
  }

  return (

    <div className="booking-table-wrapper">

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

          {bookings.map((booking) => {

            const isExpanded = expandedId === booking.id;

            return (

              <Fragment key={booking.id}>

                <tr
                  className={`booking-row ${isExpanded ? "expanded" : ""}`}
                  onClick={(e) => toggleExpanded(booking, e)}
                >

                  <td>{booking.resourceName}</td>
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

    </div>

  );

}
