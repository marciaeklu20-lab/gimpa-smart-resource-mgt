import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

// Max characters per message. Mirrored in firestore.rules — keep in sync.
const MAX_MESSAGE_LENGTH = 1000;

export const sendFaultMessage = async ({
  faultId,
  text,
  user
}) => {

  if (!faultId) {
    throw new Error("MISSING_FAULT_ID");
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

  // Single atomic batch:
  //   - create the message doc, AND
  //   - stamp the parent fault with latest-message metadata so the
  //     list UIs (FaultsList row, future unread badge) can surface
  //     unread indicators without scanning the subcollection.
  // The sender's lastReadByUser is also bumped — they implicitly
  // "read" what they just wrote.
  const batch = writeBatch(db);

  const messageRef = doc(
    collection(db, "faults", faultId, "messages")
  );

  batch.set(messageRef, {
    text: trimmed,
    authorId: user.uid,
    authorName: user.fullName || user.email || "Unknown",
    authorRole: user.role || "Unknown",
    createdAt: serverTimestamp()
  });

  batch.update(
    doc(db, "faults", faultId),
    {
      lastMessageAt: serverTimestamp(),
      lastMessageAuthorId: user.uid,
      [`lastReadByUser.${user.uid}`]: serverTimestamp()
    }
  );

  await batch.commit();

};
