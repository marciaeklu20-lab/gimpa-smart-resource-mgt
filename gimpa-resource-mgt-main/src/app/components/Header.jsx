// src/app/components/Header.jsx
"use client";

import React, { useContext } from "react";
import Image from "next/image";
import { LuContrast } from "react-icons/lu";
import { ThemeContext } from "@/app/context/ThemeContext";
import LogoutButton from "@/app/components/LogoutButton";
import "@/app/styles/components/header.css";

export default function Header({ title = "GIMPA RESOURCE MANAGEMENT", rightContent }) {
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
        <LogoutButton />
        {rightContent && <div className="header-extra">{rightContent}</div>}
      </div>
    </header>
  );
}