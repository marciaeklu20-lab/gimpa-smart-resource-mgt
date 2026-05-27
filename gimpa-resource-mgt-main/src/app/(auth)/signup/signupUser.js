import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import app from "@/firebase/config";

export const signupUser = async ({
  email,
  password,
  fullName,
  studentType,
  studentID,
  programme,
  staffID,
  position,
  department
}) => {

  console.log("🚀 Starting signup process...");

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  const SUPER_ADMIN_EMAIL = "marcia.ea.geal@gmail.com";

  const approvalRequiredRoles = [
    "Secretariat Admin",
    "Course Rep",
    "Lecturer",
    "Teaching Assistant",
    "Maintenance Officer",
    "Stores/Inventory Officer",
    "Facility/Estate Officer",
    "Procurement Officer",
    "IT Officer",
    "Higher Level Management"
  ];

  try {

   
    // Detect base role
  
    let role = null;

    if (email === SUPER_ADMIN_EMAIL) {
      role = "super_admin";
    } 
    else if (email.endsWith("@st.gimpa.edu.gh")) {
      role = "student";
    } 
    else if (email.endsWith("@gimpa.edu.gh")) {
      role = "staff";
    }

    console.log("Base role detected:", role);

    if (!role) {
      throw new Error("INVALID_EMAIL_DOMAIN");
    }

    // -----------------------
    // Create Firebase Auth user
    // -----------------------
    console.log("🔐 Creating Firebase Authentication user...");

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log("✅ Auth user created:", user.uid);

    // Refresh token so Firestore rules see auth
    await user.getIdToken();

    console.log("🔑 Auth token refreshed");

    // -----------------------
    // Determine final role
    // -----------------------
    let userRole = role === "student" ? studentType : position;

    let needsApproval = approvalRequiredRoles.includes(userRole);
    let approved = !needsApproval;

    if (email === SUPER_ADMIN_EMAIL) {
      userRole = "super_admin";
      approved = true;
      needsApproval = false;
    }

    console.log("👤 Final user role:", userRole);
    console.log("⏳ Needs approval:", needsApproval);

   
    // Create Firestore user
   
    console.log(" Writing user document to Firestore...");

    await setDoc(doc(firestore, "users", user.uid), {

      fullName,
      email,
      role: userRole,

      studentType: role === "student" ? studentType : null,
      studentID: role === "student" ? studentID : null,
      programme: role === "student" ? programme : null,

      staffID: role === "staff" ? staffID : null,
      position: role === "staff" ? position : null,

      department: department || null,

      approved,
      needsApproval,

      createdAt: serverTimestamp()

    });

    console.log("🎉 Firestore user document created successfully!");

    return {
      approved,
      message: needsApproval
        ? "Signup successful! Your account is awaiting admin approval."
        : "Signup successful! You can now login."
    };

  } catch (error) {

    console.error("Signup process failed:", error);

    throw error;

  }

};