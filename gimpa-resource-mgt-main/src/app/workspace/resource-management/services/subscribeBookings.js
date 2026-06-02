import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot
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

// Dept-routed bookings (visibleToDepartment set) must also match the
// viewer's department. Operations-routed bookings have null
// visibleToDepartment and are visible to every approver in
// visibleToRoles regardless of department. Requester's own bookings
// bypass the department filter so they always see their submissions.
const applyDepartmentFilter = (bookings, user) => {
  return bookings.filter((booking) => {
    if (booking.requesterId === user.uid) return true;
    if (!booking.visibleToDepartment) return true;
    return booking.visibleToDepartment === user.department;
  });
};

// Live subscription replacing the old one-shot fetchBookings. Calls
// onUpdate(bookings[]) on every relevant Firestore change. Returns an
// unsubscribe function that tears down all underlying listeners.
export const subscribeBookings = ({ user, onUpdate }) => {

  if (!user?.role) {
    onUpdate([]);
    return () => {};
  }

  if (ADMIN_ROLES.includes(user.role)) {

    // Admin-level roles see every booking via a single listener.
    return onSnapshot(
      query(collection(db, "bookings")),
      (snap) => {
        onUpdate(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
      }
    );

  }

  // Non-admin: union of two listeners.
  //   (a) bookings they're routed to approve (visibleToRoles match)
  //   (b) bookings they themselves submitted (requesterId match)
  // Firestore can't express that disjunction in one query without a
  // composite index, so we merge client-side.
  //
  // Each listener tracks its own membership in a Set so we only remove
  // a doc from the shared `data` map when neither listener has it. The
  // common case for "removed" here is a delete by an admin; doc-leaves-
  // query-but-still-matches-other-listener can also happen if roles/
  // routing change later.
  const visibleIds = new Set();
  const ownIds = new Set();
  const data = new Map();

  const emit = () => {
    onUpdate(applyDepartmentFilter([...data.values()], user));
  };

  const apply = (snap, mySet, theirSet) => {
    for (const change of snap.docChanges()) {
      const id = change.doc.id;
      if (change.type === "removed") {
        mySet.delete(id);
        if (!theirSet.has(id)) {
          data.delete(id);
        }
      } else {
        mySet.add(id);
        data.set(id, { id, ...change.doc.data() });
      }
    }
    emit();
  };

  const unsubVisible = onSnapshot(
    query(
      collection(db, "bookings"),
      where(
        "visibleToRoles",
        "array-contains",
        user.role
      )
    ),
    (snap) => apply(snap, visibleIds, ownIds)
  );

  const unsubOwn = onSnapshot(
    query(
      collection(db, "bookings"),
      where("requesterId", "==", user.uid)
    ),
    (snap) => apply(snap, ownIds, visibleIds)
  );

  return () => {
    unsubVisible();
    unsubOwn();
  };

};
