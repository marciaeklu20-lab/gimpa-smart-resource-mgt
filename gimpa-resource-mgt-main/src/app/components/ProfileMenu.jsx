"use client";

// Stage 7 — Header profile menu. Replaces the bare <LogoutButton /> in
// the Header with an avatar trigger that opens a right-aligned dropdown:
//   Profile  → opens the Profile modal (anchored here)
//   Settings → switches the workspace to the Settings sidebar panel
//   Sign Out → reuses the same signOut logic LogoutButton.jsx uses
//
// LogoutButton.jsx is left in place (unmounted from Header) per the
// Stage 7 decision — its signOut flow is re-implemented inline here so
// the dropdown item can sit alongside Profile/Settings.

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase/config";
import { LuUser, LuSettings, LuLogOut } from "react-icons/lu";

import Profile from "@/app/workspace/profile/Profile";

import "@/app/styles/components/profile-menu.css";

const initialsOf = (user) => {
  const source = user?.fullName || user?.email || "";
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export default function ProfileMenu({ currentUser, onRefreshUser, onOpenSettings }) {

  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const menuRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    if (signingOut) return;
    try {
      setSigningOut(true);
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setSigningOut(false);
    }
  };

  const handleOpenProfile = () => {
    setOpen(false);
    setShowProfile(true);
  };

  const handleOpenSettings = () => {
    setOpen(false);
    if (onOpenSettings) onOpenSettings();
  };

  return (
    <div className="profile-menu" ref={menuRef}>

      <button
        type="button"
        className="profile-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="profile-menu-avatar">{initialsOf(currentUser)}</span>
      </button>

      {open && (
        <div className="profile-menu-dropdown" role="menu">

          <div className="profile-menu-identity">
            <span className="profile-menu-identity-name">
              {currentUser?.fullName || "Unknown user"}
            </span>
            <span className="profile-menu-identity-email">
              {currentUser?.email || ""}
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={handleOpenProfile}
          >
            <LuUser size={16} />
            <span>Profile</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="profile-menu-item"
            onClick={handleOpenSettings}
          >
            <LuSettings size={16} />
            <span>Settings</span>
          </button>

          <div className="profile-menu-divider" />

          <button
            type="button"
            role="menuitem"
            className="profile-menu-item profile-menu-item-danger"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LuLogOut size={16} />
            <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
          </button>

        </div>
      )}

      {showProfile && (
        <Profile
          currentUser={currentUser}
          onClose={() => setShowProfile(false)}
          onSaved={onRefreshUser}
        />
      )}

    </div>
  );
}
