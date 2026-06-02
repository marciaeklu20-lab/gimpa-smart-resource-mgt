import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export const subscribeBookingMessages = ({
  bookingId,
  onUpdate
}) => {

  const q = query(
    collection(db, "bookings", bookingId, "messages"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    onUpdate(messages);
  });

};
