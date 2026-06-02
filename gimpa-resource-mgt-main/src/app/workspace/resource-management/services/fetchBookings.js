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
  if (isAdminRole) {

    const snapshot = await getDocs(query(collection(db, "bookings")));

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

  }

  // Non-admin viewers see the union of:
  //   (a) bookings they're routed to approve (visibleToRoles match)
  //   (b) bookings they themselves submitted (requesterId match)
  // Done as two queries + client-side merge because Firestore can't
  // express this disjunction without an explicit composite index.
  const [visibleSnap, ownSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "bookings"),
        where(
          "visibleToRoles",
          "array-contains",
          user.role
        )
      )
    ),
    getDocs(
      query(
        collection(db, "bookings"),
        where("requesterId", "==", user.uid)
      )
    )
  ]);

  const byId = new Map();

  visibleSnap.docs.forEach((d) => {
    byId.set(d.id, { id: d.id, ...d.data() });
  });

  ownSnap.docs.forEach((d) => {
    byId.set(d.id, { id: d.id, ...d.data() });
  });

  // Dept-routed bookings (visibleToDepartment set) must also match
  // the viewer's department. Operations-routed bookings have null
  // visibleToDepartment and are visible to every approver in
  // visibleToRoles regardless of department. Requester's own bookings
  // bypass the department filter so they always see their submissions.
  return [...byId.values()].filter((booking) => {

    if (booking.requesterId === user.uid) {
      return true;
    }

    if (!booking.visibleToDepartment) {
      return true;
    }

    return (
      booking.visibleToDepartment ===
      user.department
    );

  });

};
