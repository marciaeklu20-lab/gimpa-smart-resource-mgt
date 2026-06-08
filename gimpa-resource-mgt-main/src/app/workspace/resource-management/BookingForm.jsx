"use client";

import {
  useState
} from "react";

import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

import {
  getAuth
} from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  createBooking
} from "./services/createBooking";

// Stage 4o Phase 3 — the booking-location dropdown shares the same building
// list as the QR check-in flow so destinations always resolve to a known
// coordinate on the live map.
import { BUILDING_COORDINATES } from "@/app/lib/gimpaBuildingCoordinates";

import "@/app/styles/resource-management/booking-form.css";

const BOOKING_BUILDINGS = Object.keys(BUILDING_COORDINATES);

export default function BookingForm({
  resource,
  closeModal
}) {

  const auth = getAuth(app);

  const db = getFirestore(app);

  const [purpose, setPurpose] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [attendees, setAttendees] =
    useState("");

  const [bookingLocation, setBookingLocation] =
    useState("");

  const [startDate, setStartDate] =
    useState(new Date());

  const [endDate, setEndDate] =
    useState(new Date());

  const [loading, setLoading] =
    useState(false);

  const isFacility =
    resource.category ===
    "Facilities";

  const handleBooking = async (e) => {

    e.preventDefault();

    try {

      setLoading(true);

      const firebaseUser =
        auth.currentUser;

      if (!firebaseUser) {

        alert(
          "User not logged in"
        );

        return;

      }

      const userDoc = await getDoc(

        doc(
          db,
          "users",
          firebaseUser.uid
        )

      );

      if (!userDoc.exists()) {

        alert("User not found");

        return;

      }

      const userData = {

        uid: firebaseUser.uid,

        ...userDoc.data()

      };

      await createBooking({

        resource,

        user: userData,

        purpose,

        startDate:
          startDate.toISOString(),

        endDate:
          endDate.toISOString(),

        bookingLocation,

        notes,

        attendees:
          isFacility
            ? attendees
            : null

      });

      alert(
        "Booking request submitted successfully"
      );

      closeModal();

    } catch (error) {

      console.error(error);

      if (error.message === "BOOKING_CONFLICT") {
        alert(
          "This resource is already booked for the selected time. Please pick a different slot."
        );
      } else if (error.message === "INVALID_DATE_RANGE") {
        alert(
          "End time must be after start time."
        );
      } else if (error.message?.startsWith("RESOURCE_NOT_BOOKABLE:")) {
        const status = error.message.split(":")[1];
        alert(
          `This asset cannot be booked. Current status: ${status}`
        );
      } else if (error.message === "RESOURCE_NOT_FOUND") {
        alert(
          "This resource no longer exists."
        );
      } else if (error.message === "BOOKING_LOCATION_REQUIRED") {
        alert(
          "Please select where you'll use this resource."
        );
      } else {
        alert(
          "Failed to submit booking"
        );
      }

    } finally {

      setLoading(false);

    }

  };

  return (

    <div className="booking-overlay">

      <div className="booking-modal">

        <div className="booking-header">

          <div>

            <h2>
              Book Resource
            </h2>

            <p>
              Complete the booking request form
            </p>

          </div>

          <button
            className="close-booking-btn"
            onClick={closeModal}
          >
            ×
          </button>

        </div>

        <form
          onSubmit={handleBooking}
          className="booking-form"
        >

          <div className="booking-grid">

            <div className="booking-field">

              <label>
                Resource Name
              </label>

              <input
                type="text"
                value={
                  resource.resourceName
                }
                disabled
              />

            </div>

            <div className="booking-field">

              <label>
                Resource Category
              </label>

              <input
                type="text"
                value={
                  resource.category
                }
                disabled
              />

            </div>

          </div>

          <div className="booking-field">

            <label>
              Purpose of Booking
            </label>

            <textarea
              required
              placeholder="Explain the purpose of this booking request..."
              value={purpose}
              onChange={(e) =>
                setPurpose(
                  e.target.value
                )
              }
            />

          </div>

          <div className="booking-field">

            <label>
              Where will you use this resource?
            </label>

            <select
              required
              className="booking-location-select"
              value={bookingLocation}
              onChange={(e) =>
                setBookingLocation(
                  e.target.value
                )
              }
            >
              <option value="" disabled>
                Select a building…
              </option>
              {BOOKING_BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <small className="booking-location-help">
              We&apos;ll show the resource here on the live map during your
              booking window.
            </small>

          </div>

          <div className="booking-grid">

            <div className="booking-field">

              <label>
                Start Date & Time
              </label>

              <DatePicker
                selected={startDate}
                onChange={(date) =>
                  setStartDate(date)
                }
                showTimeSelect
                dateFormat="MMMM d, yyyy h:mm aa"
                className="booking-datepicker"
                minDate={new Date()}
              />

            </div>

            <div className="booking-field">

              <label>
                End Date & Time
              </label>

              <DatePicker
                selected={endDate}
                onChange={(date) =>
                  setEndDate(date)
                }
                showTimeSelect
                dateFormat="MMMM d, yyyy h:mm aa"
                className="booking-datepicker"
                minDate={startDate}
              />

            </div>

          </div>

          {isFacility && (

            <div className="booking-field">

              <label>
                Number of Attendees
              </label>

              <input
                type="number"
                placeholder="Enter expected attendees"
                value={attendees}
                onChange={(e) =>
                  setAttendees(
                    e.target.value
                  )
                }
              />

            </div>

          )}

          <div className="booking-field">

            <label>
              Additional Notes
            </label>

            <textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) =>
                setNotes(
                  e.target.value
                )
              }
            />

          </div>

          <div className="booking-actions">

            <button
              type="button"
              className="cancel-booking-btn"
              onClick={closeModal}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="submit-booking-btn"
            >

              {loading
                ? "Submitting..."
                : "Submit Booking"}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}