// Stage 5 — Chat: send a message to a channel or DM.
//
// Callable. Verifies the caller is an approved user, re-checks membership
// of the target conversation server-side (never trusts the client), then
// atomically appends the message and stamps the conversation's
// last-message summary fields. Runs under the Admin SDK → bypasses
// Firestore rules, so this is the ONLY write path into
// conversations/*/messages (the rules deny all client writes there).

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp();
}

const OPTS = { region: "europe-west1", cors: true };
const MAX_LEN = 2000;

export const sendMessage = onCall(OPTS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required.");

  const { conversationId, content } = request.data || {};
  if (!conversationId || typeof conversationId !== "string") {
    throw new HttpsError("invalid-argument", "conversationId required.");
  }
  const trimmed = (content || "").toString().trim();
  if (!trimmed) throw new HttpsError("invalid-argument", "Message cannot be empty.");
  if (trimmed.length > MAX_LEN) {
    throw new HttpsError("invalid-argument", `Message too long (max ${MAX_LEN} chars).`);
  }

  const db = getFirestore();

  // 1. Auth + approval.
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().approved !== true) {
    throw new HttpsError("permission-denied", "Account not approved.");
  }
  const user = userSnap.data();
  const senderName = user.fullName || user.email || uid;
  const senderRole = user.role || "unknown";

  // 2. Load conversation + membership check.
  const convoRef = db.collection("conversations").doc(conversationId);
  const convoSnap = await convoRef.get();
  if (!convoSnap.exists) throw new HttpsError("not-found", "Conversation not found.");
  const convo = convoSnap.data();

  if (convo.type === "channel") {
    // Membership mirrors the firestore.rules read gate + the client query:
    // a channel is open if it carries the "__all_approved__" sentinel
    // (#general), otherwise the sender's role must be listed. (Empty array
    // also treated as open for backward-compat with any un-reseeded doc.)
    const allowed = convo.allowedRoles || [];
    const isOpen = allowed.length === 0 || allowed.includes("__all_approved__");
    if (!isOpen && !allowed.includes(senderRole)) {
      throw new HttpsError("permission-denied", "Not a member of this channel.");
    }
  } else if (convo.type === "dm") {
    if (!(convo.participantIds || []).includes(uid)) {
      throw new HttpsError("permission-denied", "Not a participant in this DM.");
    }
  } else {
    throw new HttpsError("internal", "Unknown conversation type.");
  }

  // 3. Atomic write: append message + refresh conversation summary fields.
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  const msgRef = convoRef.collection("messages").doc();
  batch.set(msgRef, {
    senderId: uid,
    senderName,
    senderRole,
    content: trimmed,
    createdAt: now
  });

  batch.update(convoRef, {
    lastMessageAt: now,
    lastMessagePreview: trimmed.slice(0, 80),
    lastMessageSenderId: uid,
    lastMessageSenderName: senderName
  });

  await batch.commit();
  return { ok: true, messageId: msgRef.id };
});
