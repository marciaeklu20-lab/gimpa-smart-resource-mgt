import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import {
  PLATFORM_ADMINS,
  MAINTENANCE_ROLES
} from "@/app/lib/roles";

const db = getFirestore(app);

// Roles that see every supply request regardless of requester. Mirrors
// firestore.rules' canSeeSupplyRequest() — kept here for client-side
// query selection; the rules enforce the same access.
const ALL_SEEN_ROLES = new Set([
  ...PLATFORM_ADMINS,
  ...MAINTENANCE_ROLES,
  "Stores/Inventory Officer"
]);

// Subscribe to supply requests visible to the current user.
//
// Maintenance domain + Stores + admins see every request (the filter
// tabs in SupplyRequestsList narrow the visible slice). Everyone else
// sees only their own — rules enforce the same shape.
//
// Returns the onSnapshot unsubscribe function. Returns a no-op when
// the caller is missing uid/role so consumers can call it
// unconditionally in a useEffect cleanup.
export const subscribeSupplyRequests = ({ user, onUpdate, onError }) => {

  if (!user?.uid || !user?.role) {
    onUpdate([]);
    return () => {};
  }

  const canSeeAll = ALL_SEEN_ROLES.has(user.role);

  const q = canSeeAll
    ? query(
        collection(db, "supplyRequests"),
        orderBy("createdAt", "desc")
      )
    : query(
        collection(db, "supplyRequests"),
        where("requesterId", "==", user.uid),
        orderBy("createdAt", "desc")
      );

  return onSnapshot(
    q,
    (snap) => onUpdate(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    ),
    (err) => {
      console.error("subscribeSupplyRequests error:", err);
      if (onError) onError(err);
    }
  );
};
