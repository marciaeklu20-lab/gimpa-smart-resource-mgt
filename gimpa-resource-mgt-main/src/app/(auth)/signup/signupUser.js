import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import app from "@/firebase/config";
import { departmentRoles } from "@/app/workspace/resource-management/services/permissions";

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

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  // ---------------------------------------------------------------
  // 1. Validate everything we can BEFORE touching Firebase Auth.
  //    This avoids creating an Auth account that we then have to
  //    roll back if a downstream check fails.
  // ---------------------------------------------------------------

  let baseRole = null;

  if (email === SUPER_ADMIN_EMAIL) {
    baseRole = "super_admin";
  } else if (email.endsWith("@st.gimpa.edu.gh")) {
    baseRole = "student";
  } else if (email.endsWith("@gimpa.edu.gh")) {
    baseRole = "staff";
  }

  if (!baseRole) {
    throw new Error("INVALID_EMAIL_DOMAIN");
  }

  // Compute the final role string that will be stored on the user doc.
  let userRole;
  if (baseRole === "super_admin") {
    userRole = "super_admin";
  } else if (baseRole === "student") {
    userRole = studentType;
  } else {
    userRole = position;
  }

  if (!userRole) {
    throw new Error("MISSING_ROLE");
  }

  // Dept-bound roles (Course Rep, Lecturer, Teaching Assistant) MUST
  // have a department selected — booking routing falls apart otherwise.
  if (departmentRoles.includes(userRole) && !department) {
    throw new Error("MISSING_DEPARTMENT");
  }

  let needsApproval = approvalRequiredRoles.includes(userRole);
  let approved = !needsApproval;

  if (baseRole === "super_admin") {
    approved = true;
    needsApproval = false;
  }

  // ---------------------------------------------------------------
  // 2. Create the Firebase Auth user.
  // ---------------------------------------------------------------
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Refresh token so Firestore rules see auth on the next write.
  await user.getIdToken();

  // ---------------------------------------------------------------
  // 3. Write the Firestore user doc. If that fails, delete the
  //    Auth user we just created so we don't leave an orphan.
  // ---------------------------------------------------------------
  try {

    await setDoc(doc(firestore, "users", user.uid), {

      fullName,
      email,
      role: userRole,

      studentType: baseRole === "student" ? studentType : null,
      studentID: baseRole === "student" ? studentID : null,
      programme: baseRole === "student" ? programme : null,

      staffID: baseRole === "staff" ? staffID : null,
      position: baseRole === "staff" ? position : null,

      department: department || null,

      approved,
      needsApproval,

      createdAt: serverTimestamp()

    });

  } catch (firestoreError) {

    // Roll back the Auth account so the user can retry signup with
    // the same email instead of hitting auth/email-already-in-use.
    try {
      await user.delete();
    } catch (deleteError) {
      console.error("Failed to roll back orphan Auth user:", deleteError);
    }

    throw firestoreError;

  }

  return {
    approved,
    message: needsApproval
      ? "Signup successful! Your account is awaiting admin approval."
      : "Signup successful! You can now login."
  };

};
