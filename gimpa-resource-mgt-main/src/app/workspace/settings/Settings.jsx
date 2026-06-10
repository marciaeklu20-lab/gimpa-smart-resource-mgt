"use client";

// Stage 7 — Settings panel. Rendered as a sidebar surface
// (activeSidebar === "Settings") and reached either from the bottom of
// the Sidebar footer or the Header ProfileMenu dropdown.
//
// Persists a nested object on users/{uid}:
//   notificationPrefs: { weeklyReports, faultAlerts, theme }
// theme ∈ "light" | "dark" | "system". The existing /users/{uid}
// self-update rule permits arbitrary fields except role + approved, so
// no rule deploy is needed.
//
// Toggle / select changes debounce-save (300ms) so the UI feels
// immediate without one write per interaction. The theme select also
// drives the existing ThemeContext for light/dark; "system" is
// persisted but not applied (ThemeContext has no system mode yet —
// out of scope this stage). The Header theme-toggle stays in place and
// writes the same surface; the redundancy is intentional for now.

import React, { useContext, useEffect, useRef, useState } from "react";
import {
  getFirestore,
  doc,
  updateDoc
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import app, { auth } from "@/firebase/config";

import { ThemeContext } from "@/app/context/ThemeContext";

import "@/app/styles/workspace/settings.css";

const db = getFirestore(app);

const DEFAULT_PREFS = {
  weeklyReports: false,
  faultAlerts: false,
  theme: "system"
};

export default function Settings({ currentUser }) {

  const { theme, toggleTheme } = useContext(ThemeContext);

  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT_PREFS,
    ...(currentUser?.notificationPrefs || {})
  }));
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error

  const [resetMsg, setResetMsg] = useState(null); // { type, text }
  const [resetting, setResetting] = useState(false);

  const saveTimer = useRef(null);

  // Re-seed if the user doc reloads with a different prefs object.
  useEffect(() => {
    setPrefs({ ...DEFAULT_PREFS, ...(currentUser?.notificationPrefs || {}) });
  }, [currentUser?.uid]);

  // Debounced persistence of the whole nested object.
  const scheduleSave = (next) => {
    if (!currentUser?.uid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), {
          notificationPrefs: next
        });
        setSaveState("saved");
      } catch (err) {
        console.error("[Settings] save failed:", err);
        setSaveState("error");
      }
    }, 300);
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    scheduleSave(next);
  };

  const handleThemeChange = (value) => {
    update({ theme: value });
    // Apply light/dark immediately via the existing ThemeContext.
    // "system" is persisted only (no system mode in ThemeContext yet).
    if ((value === "light" || value === "dark") && value !== theme) {
      toggleTheme();
    }
  };

  const handleChangePassword = async () => {
    if (resetting || !currentUser?.email) return;
    setResetMsg(null);
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setResetMsg({
        type: "success",
        text: `Reset link sent to ${currentUser.email}. Check your inbox.`
      });
    } catch (err) {
      console.error("[Settings] password reset failed:", err);
      setResetMsg({
        type: "error",
        text: "Couldn't send the reset link. Please try again in a moment."
      });
    } finally {
      setResetting(false);
    }
  };

  const saveLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "All changes saved"
    : saveState === "error" ? "Couldn't save — retry a change"
    : "";

  return (
    <div className="settings-panel">

      <header className="settings-header">
        <h1>Settings</h1>
        {saveLabel && (
          <span className={`settings-save-state settings-save-${saveState}`}>
            {saveLabel}
          </span>
        )}
      </header>

      <section className="settings-section">
        <h2>Notifications</h2>

        <label className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-title">Weekly report emails</span>
            <span className="settings-row-desc">
              Receive the Monday digest of activity in your area.
            </span>
          </span>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={!!prefs.weeklyReports}
            onChange={(e) => update({ weeklyReports: e.target.checked })}
          />
        </label>

        <label className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-title">Fault alerts</span>
            <span className="settings-row-desc">
              Get notified when faults are reported or updated.
            </span>
          </span>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={!!prefs.faultAlerts}
            onChange={(e) => update({ faultAlerts: e.target.checked })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-title">Theme</span>
            <span className="settings-row-desc">
              Choose how the workspace looks.
            </span>
          </span>
          <select
            className="settings-select"
            value={prefs.theme}
            onChange={(e) => handleThemeChange(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>Security</h2>
        <div className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-title">Password</span>
            <span className="settings-row-desc">
              We'll email a reset link to {currentUser?.email || "your address"}.
            </span>
          </span>
          <button
            type="button"
            className="settings-btn"
            onClick={handleChangePassword}
            disabled={resetting || !currentUser?.email}
          >
            {resetting ? "Sending…" : "Change Password"}
          </button>
        </div>
        {resetMsg && (
          <p className={`settings-reset-msg settings-reset-${resetMsg.type}`}>
            {resetMsg.text}
          </p>
        )}
      </section>

    </div>
  );
}
