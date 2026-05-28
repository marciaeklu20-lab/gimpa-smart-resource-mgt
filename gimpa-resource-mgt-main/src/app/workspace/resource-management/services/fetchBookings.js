import {
  getFirestore,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export const fetchBookings = async (user) => {

  if (!user?.role) {
    return [];
  }

  const q = query(
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
