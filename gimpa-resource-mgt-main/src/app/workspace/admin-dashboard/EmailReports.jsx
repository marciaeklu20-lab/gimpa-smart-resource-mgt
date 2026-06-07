"use client";

// Stage 4l — Email Reports admin tab. Lets a super_admin trigger the
// weekly report pipeline on demand (the same pipeline Cloud Scheduler
// runs every Monday 09:00 UTC) for demos / spot checks.
//
// The callable (sendWeeklyReportNow) re-verifies super_admin role
// server-side via a Firestore lookup, so this UI is a convenience
// surface — it does not itself grant access. Recent sends are kept in
// component state only (no Firestore persistence for v1).

import { useState } from "react";

import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";

import { ADMIN_LEVEL_ROLES } from "@/app/lib/roles";

import "@/app/styles/admin-dashboard/EmailReports.css";

const REGION = "europe-west1";

const formatTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export default function EmailReports({ currentUser }) {

  const role = currentUser?.role;
  const isAuthorized = role && ADMIN_LEVEL_ROLES.includes(role);

  // Stage 4l follow-up: Maintenance Admins receive the maintenance-scoped
  // report variant; the copy below reflects what they'll actually get.
  const isMaintenanceFocused = role === "Maintenance Admin";

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { type, message }
  const [history, setHistory] = useState([]);  // session-only log

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    setResult(null);

    try {
      const functions = getFunctions(app, REGION);
      const fn = httpsCallable(functions, "sendWeeklyReportNow");
      const { data } = await fn();

      const generatedAt = data?.generatedAt || new Date().toISOString();

      if (data?.skipped) {
        const message = "Skipped — no activity in the past 7 days.";
        setResult({ type: "skipped", message });
        setHistory((prev) => [{ generatedAt, message }, ...prev].slice(0, 10));
      } else {
        const count = data?.sentTo ?? 0;
        const message =
          count > 0
            ? `Sent to ${count} recipient${count === 1 ? "" : "s"} at ${formatTime(generatedAt)}.`
            : "Completed, but no admin-level recipients were found.";
        setResult({ type: count > 0 ? "success" : "warning", message });
        setHistory((prev) => [{ generatedAt, message }, ...prev].slice(0, 10));
      }
    } catch (err) {
      console.error("[EmailReports] send failed:", err);
      const code = err?.code || "";
      const message = code.includes("permission-denied")
        ? "Only admin-level roles can send reports."
        : code.includes("unauthenticated")
          ? "Your session has expired — please sign in again."
          : "Couldn't send the report. Please try again in a moment.";
      setResult({ type: "error", message });
    } finally {
      setSending(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="email-reports-container">
        <h2>Reports</h2>
        <p className="email-reports-empty">
          You don't have permission to access this surface.
        </p>
      </div>
    );
  }

  return (
    <div className="email-reports">

      <div className="email-reports-header">
        <h2 className="email-reports-title">Email Reports</h2>
        <p className="email-reports-subtitle">
          {isMaintenanceFocused
            ? "Weekly maintenance digest covering faults, supply requests, " +
              "and asset condition — sent every Monday at 09:00 UTC."
            : "Weekly executive digest covering bookings, faults, supply, " +
              "and signups — sent every Monday at 09:00 UTC."}
          {" Click below to send a test report on demand."}
        </p>
      </div>

      <div className="email-reports-card">
        <div className="email-reports-card-text">
          <h3>Admin weekly report</h3>
          <p>
            Summarises the past 7 days of bookings, faults, supply
            requests, and signups, with an AI-written executive summary.
          </p>
        </div>
        <button
          type="button"
          className="email-reports-send-btn"
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? "Sending…" : "Send test report"}
        </button>
      </div>

      {result && (
        <div className={`email-reports-result email-reports-result-${result.type}`}>
          {result.message}
        </div>
      )}

      {history.length > 0 && (
        <div className="email-reports-history">
          <h4>This session</h4>
          <ul>
            {history.map((h, i) => (
              <li key={`${h.generatedAt}-${i}`}>
                <span className="email-reports-history-time">
                  {formatTime(h.generatedAt)}
                </span>
                <span className="email-reports-history-msg">{h.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="email-reports-footer">
        Powered by Resend for delivery + Groq (Llama 3.3 70B) for the
        narrative section.
      </p>

    </div>
  );
}
