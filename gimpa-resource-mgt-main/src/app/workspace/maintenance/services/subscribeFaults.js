import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { MAINTENANCE_ROLES } from "@/app/lib/roles";

const db = getFirestore(app);

// Subscribe to faults visible to the current user.
//
// Mirrors subscribeBookings.js: Maintenance Staff / super_admin see
// every fault; everyone else sees only the faults they reported.
// Firestore rules enforce the same visibility — the per-role query
// is purely client-side filtering for UX and to keep payload small.
//
// Returns the onSnapshot unsubscribe function. Returns a no-op when
// the caller is missing uid/role so the consumer can call it
// unconditionally in a useEffect cleanup.
export const subscribeFaults = ({ user, onUpdate, onError }) => {

  if (!user?.uid || !user?.role) {
    onUpdate([]);
    return () => {};
  }

  const isMaintenance = MAINTENANCE_ROLES.includes(user.role);

  const q = isMaintenance
    ? query(
        collection(db, "faults"),
        orderBy("createdAt", "desc")
      )
    : query(
        collection(db, "faults"),
        where("reporterId", "==", user.uid),
        orderBy("createdAt", "desc")
      );

  return onSnapshot(
    q,
    (snap) => onUpdate(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    ),
    (err) => {
      console.error("subscribeFaults error:", err);
      if (onError) onError(err);
    }
  );
};
