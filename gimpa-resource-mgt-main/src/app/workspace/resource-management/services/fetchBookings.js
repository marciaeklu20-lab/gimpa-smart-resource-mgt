import {
  getFirestore,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

// Roles that see every booking regardless of visibleToRoles /
// visibleToDepartment. Mirrors firestore.rules isAdmin() ∪
// isGlobalApprover() — kept in sync manually since the rules
// file can't import JS.
const ADMIN_ROLES = [
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management"
];

export const fetchBookings = async (user) => {

  if (!user?.role) {
    return [];
  }

  const isAdminRole = ADMIN_ROLES.includes(user.role);

  // Admin-level roles bypass visibleToRoles / visibleToDepartment
  // and see every booking in the collection.
  const q = isAdminRole
    ? query(collection(db, "bookings"))
    : query(
        collection(db, "bookings"),
        where(
          "visibleToRoles",
          "array-contains",
          user.role
        )
      );

  const snapshot = await getDocs(q);

  const all = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));

  if (isAdminRole) {
    return all;
  }

  // Dept-routed bookings (visibleToDepartment set) must also match
  // the viewer's department. Operations-routed bookings have null
  // visibleToDepartment and are visible to every approver in
  // visibleToRoles regardless of department.
  return all.filter((booking) => {

    if (!booking.visibleToDepartment) {
      return true;
    }

    return (
      booking.visibleToDepartment ===
      user.department
    );

  });

};
