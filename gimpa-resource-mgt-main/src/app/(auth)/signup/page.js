"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "@/app/styles/auth/login.css";
import { Eye, EyeOff } from "lucide-react";
import RoleSelector from "./RoleSelector";
import { signupUser } from "./signupUser";

export default function SignupPage() {

  const router = useRouter();

  // -----------------------------
  // Form states
  // -----------------------------
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [fullName, setFullName] = useState("");

  const [studentID, setStudentID] = useState("");
  const [programme, setProgramme] = useState("");

  const [staffID, setStaffID] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");

  const [studentType, setStudentType] = useState("");

  const [idFile, setIdFile] = useState(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [message, setMessage] = useState("");

  // -----------------------------
  // Signup Handler
  // -----------------------------
  const handleSignup = async (e) => {

    e.preventDefault();

    console.log("Signup form submitted");

    try {

      // Password validation
      if (password !== confirmPassword) {
        console.warn("Passwords do not match");
        setMessage("Passwords do not match.");
        return;
      }

      console.log("Sending signup data:", {
        email,
        fullName,
        studentType,
        studentID,
        programme,
        staffID,
        position,
        department,
        idFile
      });

      // Call signup logic
      const result = await signupUser({
        email,
        password,
        fullName,
        studentType,
        studentID,
        programme,
        staffID,
        position,
        department,
        idFile
      });

      console.log("Signup function returned:", result);

      // -----------------------------
      // Success messages
      // -----------------------------
      if (result.approved) {

        console.log("🎉 Account approved immediately");

        setMessage(
          "Signup successful! Your account is active. Redirecting to login..."
        );

      } else {

        console.log("⏳ Account requires admin approval");

        setMessage(
          "Signup successful! Your account is awaiting admin approval. Redirecting to login..."
        );

      }

      // -----------------------------
      // Redirect to login
      // -----------------------------
      setTimeout(() => {

        console.log("➡ Redirecting user to login page");

        router.push("/login");

      }, 2500);

    } catch (error) {

      console.error("🔥 Signup error:", error);

      if (error.message === "INVALID_EMAIL_DOMAIN") {
        setMessage("Please use a valid GIMPA email.");
      }
      else if (error.message === "MISSING_ROLE") {
        setMessage("Please select a role before signing up.");
      }
      else if (error.message === "MISSING_DEPARTMENT") {
        setMessage("Please select a department for this role.");
      }
      else if (error.code === "auth/email-already-in-use") {
        setMessage("This email is already registered.");
      }
      else if (error.code === "auth/weak-password") {
        setMessage("Password must be at least 6 characters.");
      }
      else {
        setMessage("Signup failed. Check console logs.");
      }

    }
  };

  return (
    <div className="login-container">

      <div className="login-form">

        <img
          src="/images/gimpa-logo.png"
          alt="GIMPA Logo"
          className="logo"
          width={140}
          height={140}
        />

        <h1 className="login-heading">GRM</h1>

        <p className="login-tagline">
          Welcome to GIMPA Resource Manager
        </p>

        <form onSubmit={handleSignup}>

          {/* Full Name */}
          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e)=>setFullName(e.target.value)}
            required
          />

          {/* Email */}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
          />

          {/* Password */}
          <div className="password-wrapper">

            <input
              type={showPassword ? "text":"password"}
              placeholder="Password"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              required
            />

            <span onClick={()=>setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff/> : <Eye/>}
            </span>

          </div>

          {/* Confirm Password */}
          <div className="password-wrapper">

            <input
              type={showConfirmPassword ? "text":"password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e)=>setConfirmPassword(e.target.value)}
              required
            />

            <span onClick={()=>setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <EyeOff/> : <Eye/>}
            </span>

          </div>

          {/* Student fields */}
          {email.endsWith("@st.gimpa.edu.gh") && (

            <>

              <input
                type="text"
                placeholder="Student ID"
                value={studentID}
                onChange={(e)=>setStudentID(e.target.value)}
                required
              />

              <input
                type="text"
                placeholder="Programme"
                value={programme}
                onChange={(e)=>setProgramme(e.target.value)}
                required
              />

              <RoleSelector
                roleType="student"
                studentType={studentType}
                setStudentType={setStudentType}
                position={position}
                setPosition={setPosition}
                department={department}
                setDepartment={setDepartment}
              />

              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={(e)=>setIdFile(e.target.files[0])}
                required
              />

            </>

          )}

          {/* Staff fields */}
          {email.endsWith("@gimpa.edu.gh") && (

            <>

              <input
                type="text"
                placeholder="Staff ID"
                value={staffID}
                onChange={(e)=>setStaffID(e.target.value)}
                required
              />

              <RoleSelector
                roleType="staff"
                studentType={studentType}
                setStudentType={setStudentType}
                position={position}
                setPosition={setPosition}
                department={department}
                setDepartment={setDepartment}
              />

            </>

          )}

          <button type="submit">
            Sign Up
          </button>

        </form>

        {message && <p className="login-message">{message}</p>}

      </div>

    </div>
  );
}