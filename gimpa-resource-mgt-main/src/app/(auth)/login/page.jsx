"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import "@/app/styles/auth/login.css";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  // Next.js router for page navigation
  const router = useRouter();

  // State variables for email, password, visibility, messages, and loading state
  const [email, setEmail] = useState(""); // stores user email input
  const [password, setPassword] = useState(""); // stores user password input
  const [showPassword, setShowPassword] = useState(false); // toggle for password visibility
  const [message, setMessage] = useState(""); // stores user-friendly messages (success/error)
  const [loading, setLoading] = useState(false); // loading state for login button

  // Function to detect user role based on email domain
  const getUserRoleByEmail = (email) => {
    if (email.endsWith("@st.gimpa.edu.gh")) return "student";
    if (email.endsWith("@gimpa.edu.gh")) return "lecturer";
    if (email.endsWith("@gimpa.edu.gh") || email.endsWith("@gmail.com")) return "admin";
    return null; // invalid email
  };

  // Function to handle login submission
  const handleLogin = async (e) => {
    e.preventDefault(); // prevent page refresh
    setMessage(""); // clear previous messages
    setLoading(true); // start loading

    // Detect role from email
    const roleFromEmail = getUserRoleByEmail(email);

    // If email domain is invalid, show message and stop
    if (!roleFromEmail) {
      setMessage("Only institutional or admin emails are allowed.");
      setLoading(false);
      return;
    }

    try {
      // Dynamically import Firebase authentication functions
      const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");

      // Import our pre-initialized Firebase auth instance
      const { auth } = await import("@/firebaseConfig");

      // Attempt to sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Login successful — optional message to user
      setMessage("Login successful!");

      // Redirect user to workspace page after successful login
      router.replace("/workspace");

    } catch (error) {
      // Log the full Firebase error in console (developer only)
      console.error("Firebase login error:", error);

      // Show only user-friendly error messages in frontend
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        setMessage("Invalid email or password."); // incorrect credentials
      } else if (error.code === "auth/invalid-email") {
        setMessage("Invalid email format."); // badly formatted email
      } else {
        setMessage("Login failed. Please try again."); // generic fallback
      }
    } finally {
      // Always stop loading after login attempt
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        {/* GIMPA Logo */}
        <img src="/images/gimpa-logo.png" alt="GIMPA Logo" className="logo" width={140} height={140} />

        <h1 className="login-heading">GRM</h1>
        <p className="login-tagline">Welcome to GIMPA Resource Manager</p>

        {/* Login form */}
        <form onSubmit={handleLogin}>
          {/* Email input */}
          <input
            type="email"
            placeholder="Institutional or admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {/* Password input with toggle */}
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"} // toggle between text/password
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="show-password-toggle" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff /> : <Eye />}
            </span>
          </div>

          {/* Login button */}
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        {/* Additional auth links */}
        <div className="auth-links">
          <button type="button" className="reset-link">Password Reset</button>
          <a href="/signup" className="reset-link">Sign Up</a>
        </div>

        {/* Display user-friendly message */}
        {message && <p className="success-message">{message}</p>}
      </div>
    </div>
  );
}