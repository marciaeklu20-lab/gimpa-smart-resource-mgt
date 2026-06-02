import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

// Max characters per message. Mirrored in firestore.rules — keep in sync.
const MAX_MESSAGE_LENGTH = 1000;

export const sendBookingMessage = async ({
  bookingId,
  text,
  user
}) => {

  if (!bookingId) {
    throw new Error("MISSING_BOOKING_ID");
  }

  if (!user?.uid) {
    throw new Error("MISSING_USER");
  }

  const trimmed = (text || "").trim();

  if (!trimmed) {
    throw new Error("EMPTY_MESSAGE");
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  await addDoc(
    collection(db, "bookings", bookingId, "messages"),
    {
      text: trimmed,
      authorId: user.uid,
      authorName: user.fullName || user.email || "Unknown",
      authorRole: user.role || "Unknown",
      createdAt: serverTimestamp()
    }
  );

};
