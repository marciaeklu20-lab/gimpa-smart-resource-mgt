"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase/config";
import { LuLogOut } from "react-icons/lu";

export default function LogoutButton() {

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;

    try {
      setLoading(true);
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="logout-btn"
      aria-label="Log out"
    >
      <LuLogOut size={18} />
      <span>{loading ? "Logging out..." : "Logout"}</span>
    </button>
  );
}
