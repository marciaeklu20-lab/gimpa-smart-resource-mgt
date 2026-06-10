// src/app/components/Header.jsx
"use client";

import React, { useContext } from "react";
import Image from "next/image";
import { LuContrast } from "react-icons/lu";
import { ThemeContext } from "@/app/context/ThemeContext";
import ProfileMenu from "@/app/components/ProfileMenu";
import "@/app/styles/components/header.css";

// Stage 7: the bare <LogoutButton /> is replaced by <ProfileMenu />
// (avatar dropdown with Profile / Settings / Sign Out). LogoutButton.jsx
// is left in the repo but no longer mounted here. currentUser /
// onRefreshUser / onOpenSettings are threaded through from page.jsx.
export default function Header({
  title = "GIMPA RESOURCE MANAGEMENT",
  rightContent,
  currentUser,
  onRefreshUser,
  onOpenSettings
}) {
  const { theme, toggleTheme } = useContext(ThemeContext);

  return (
    <header className="header-container">
      {/* Left: Logo and title */}
      <div className="header-left">
        <Image
          src="/images/gimpa-logo.png"
          alt="GIMPA Logo"
          width={60}
          height={60}
          className="header-logo"
        />
        <h1 className="header-title">{title}</h1>
      </div>

      {/* Right: theme toggle + optional rightContent */}
      <div className="header-right">
        <button
          onClick={toggleTheme}
          className={`theme-toggle-btn ${theme}`}
          aria-label="Toggle Dark/Light Mode"
        >
          <LuContrast size={24} />
        </button>
        <ProfileMenu
          currentUser={currentUser}
          onRefreshUser={onRefreshUser}
          onOpenSettings={onOpenSettings}
        />
        {rightContent && <div className="header-extra">{rightContent}</div>}
      </div>
    </header>
  );
}