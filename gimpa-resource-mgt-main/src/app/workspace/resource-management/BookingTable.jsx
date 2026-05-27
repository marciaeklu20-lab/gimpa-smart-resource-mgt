"use client";

import {
  approveBooking
} from "./services/approveBooking";

import {
  rejectBooking
} from "./services/rejectBooking";

import "@/app/styles/resource-management/booking-table.css";

export default function BookingTable({
  bookings,
  currentUser,
  refreshBookings
}) {

  const handleApprove = async (
    bookingId
  ) => {

    try {

      await approveBooking(
        bookingId,
        currentUser
      );

      refreshBookings();

    } catch (error) {

      console.error(error);

    }

  };

  const handleReject = async (
    bookingId
  ) => {

    try {

      await rejectBooking(
        bookingId,
        currentUser
      );

      refreshBookings();

    } catch (error) {

      console.error(error);

    }

  };

  return (

    <div className="booking-table-wrapper">

      <table className="booking-table">

        <thead>

          <tr>

            <th>
              Resource
            </th>

            <th>
              Requester
            </th>

            <th>
              Role
            </th>

            <th>
              Department
            </th>

            <th>
              Purpose
            </th>

            <th>
              Status
            </th>

            <th>
              Actions
            </th>

          </tr>

        </thead>

        <tbody>

          {bookings.map((booking) => (

            <tr key={booking.id}>

              <td>
                {booking.resourceName}
              </td>

              <td>
                {booking.requesterName}
              </td>

              <td>
                {booking.requesterRole}
              </td>

              <td>
                {booking.requesterDepartment ||
                  "-"}
              </td>

              <td>
                {booking.purpose}
              </td>

              <td>
                {booking.status}
              </td>

              <td>

                {booking.status ===
                  "pending" && (

                  <div className="booking-actions">

                    <button
                      className="approve-btn"
                      onClick={() =>
                        handleApprove(
                          booking.id
                        )
                      }
                    >
                      Approve
                    </button>

                    <button
                      className="reject-btn"
                      onClick={() =>
                        handleReject(
                          booking.id
                        )
                      }
                    >
                      Reject
                    </button>

                  </div>

                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}