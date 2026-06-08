"use client";

// Stage 4o Phase 2 — QR check-in panel on the public scan page.
//
// Rendered below the read-only PublicResourceView when a user is signed
// in. Lets them record that this resource is now at a chosen building.
// The actual write goes through the checkInResource Cloud Function, which
// re-verifies the caller is approved and stamps the move server-side — so
// nothing here is trusted for authorisation.

import { useState } from "react";

import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";
import { BUILDING_COORDINATES } from "@/app/lib/gimpaBuildingCoordinates";

import "@/app/styles/movements/CheckInForm.css";

const REGION = "europe-west1";
const BUILDINGS = Object.keys(BUILDING_COORDINATES);

export default function CheckInForm({ resource, currentUser }) {

  const assetCode = resource?.assetCode || resource?.id;

  const [building, setBuilding] = useState("");
  const [floorRoom, setFloorRoom] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!building) {
      setErrorMsg("Please choose a building.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const functions = getFunctions(app, REGION);
      const checkIn = httpsCallable(functions, "checkInResource");
      await checkIn({
        assetCode,
        building,
        floorRoom: floorRoom.trim() || null,
        note: note.trim() || null
      });
      setStatus("success");
    } catch (err) {
      console.error("[CheckInForm] check-in failed:", err);
      setErrorMsg(
        err?.message ||
          "Could not check this resource in. Please try again."
      );
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="checkin-card checkin-success">
        <h2>Checked in ✓</h2>
        <p>
          <strong>{resource?.resourceName || assetCode}</strong> is now
          recorded at <strong>{building}</strong>.
        </p>
        <a className="checkin-map-link" href={`/workspace/map/${encodeURIComponent(assetCode)}`}>
          View on the live map →
        </a>
      </div>
    );
  }

  return (
    <form className="checkin-card" onSubmit={handleSubmit}>
      <h2 className="checkin-title">Check this resource in</h2>
      <p className="checkin-subtitle">
        Update where <strong>{resource?.resourceName || assetCode}</strong> is
        right now.
      </p>

      <label className="checkin-label" htmlFor="checkin-building">
        Building
      </label>
      <select
        id="checkin-building"
        className="checkin-input"
        value={building}
        onChange={(e) => setBuilding(e.target.value)}
        disabled={status === "submitting"}
        required
      >
        <option value="">Select a building…</option>
        {BUILDINGS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>

      <label className="checkin-label" htmlFor="checkin-room">
        Floor / room <span className="checkin-optional">(optional)</span>
      </label>
      <input
        id="checkin-room"
        type="text"
        className="checkin-input"
        placeholder="e.g. 2nd floor, Room 204"
        value={floorRoom}
        onChange={(e) => setFloorRoom(e.target.value)}
        disabled={status === "submitting"}
      />

      <label className="checkin-label" htmlFor="checkin-note">
        Note <span className="checkin-optional">(optional)</span>
      </label>
      <textarea
        id="checkin-note"
        className="checkin-input checkin-textarea"
        placeholder="e.g. Moved for lecture demo"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={status === "submitting"}
        rows={2}
        maxLength={500}
      />

      {status === "error" && errorMsg && (
        <p className="checkin-error">{errorMsg}</p>
      )}

      <button
        type="submit"
        className="checkin-submit"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Checking in…" : "Check this resource in here"}
      </button>
    </form>
  );
}
