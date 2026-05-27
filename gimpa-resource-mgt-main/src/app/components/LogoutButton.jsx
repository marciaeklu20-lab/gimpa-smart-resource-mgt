// src/app/components/LogoutButton.jsx
"use client";
import React from "react";

export default function LogoutButton() {
  const handleLogout = () => {
    // your logout logic here
    console.log("Logging out...");
  };

  return (
    <button onClick={handleLogout} className="logout-btn">
      Logout
    </button>
  );
}