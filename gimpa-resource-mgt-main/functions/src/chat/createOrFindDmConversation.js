// Stage 5 — Chat: idempotently create (or find) a 1:1 DM conversation.
//
// Callable. Sorting the two UIDs alphabetically yields a stable
// participantIdsKey, so only one conversation can ever exist per pair
// regardless of who initiates — calling twice returns the same id.
//
// Participant names + roles are DENORMALISED onto the doc because the
// Firestore rules forbid a non-admin user from reading another user's
// users/{uid} doc (allow get is self-or-admin only). The chat UI must be
// able to render the partner's display name without that read, so we copy
// it here at creation time.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp();
}

const OPTS = { region: "europe-west1", cors: true };

export const createOrFindDmConversation = onCall(OPTS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required.");

  const { targetUid } = request.data || {};
  if (!targetUid || typeof targetUid !== "string" || targetUid === uid) {
    throw new HttpsError("invalid-argument", "Valid target user required.");
  }

  const db = getFirestore();

  // Caller approval.
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().approved !== true) {
    throw new HttpsError("permission-denied", "Account not approved.");
  }
  const me = userSnap.data();

  // Target must exist + be approved.
  const targetSnap = await db.collection("users").doc(targetUid).get();
  if (!targetSnap.exists || targetSnap.data().approved !== true) {
    throw new HttpsError("not-found", "Target user not available.");
  }
  const target = targetSnap.data();

  const participantIds = [uid, targetUid].sort();
  const participantIdsKey = participantIds.join("_");

  // Look for an existing DM for this pair.
  const existing = await db.collection("conversations")
    .where("type", "==", "dm")
    .where("participantIdsKey", "==", participantIdsKey)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { ok: true, conversationId: existing.docs[0].id, existed: true };
  }

  // Denormalised display data so the client never has to read the other
  // user's doc (rules forbid it for non-admins).
  const participantNames = {
    [uid]: me.fullName || me.email || uid,
    [targetUid]: target.fullName || target.email || targetUid
  };
  const participantRoles = {
    [uid]: me.role || "unknown",
    [targetUid]: target.role || "unknown"
  };

  const now = FieldValue.serverTimestamp();
  const newRef = await db.collection("conversations").add({
    type: "dm",
    participantIds,
    participantIdsKey,
    participantNames,
    participantRoles,
    createdAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageSenderId: null,
    lastMessageSenderName: null
  });

  return { ok: true, conversationId: newRef.id, existed: false };
});
