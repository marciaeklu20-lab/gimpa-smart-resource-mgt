"use client";

// Stage 5 — real-time list of the channels + DMs the current user can see.
//
// Two listeners merged into one onUpdate({ channels, dms }):
//   · Channels — queried by allowedRoles array-contains-any [role,
//     "__all_approved__"]. Firestore evaluates rules as a filter-rejection,
//     not a row filter: a list query that COULD return an unreadable doc
//     fails entirely. Constraining the query on the SAME field the rule
//     inspects (allowedRoles) lets Firestore prove every returned doc is
//     readable, so the snapshot is allowed. Open channels (#general) carry
//     the "__all_approved__" sentinel since array-contains-any can't match
//     an empty array. Uses the `type + allowedRoles` array index.
//   · DMs — participantIds array-contains the user's uid. Channels have no
//     participantIds field, so this listener returns only the user's DMs
//     and needs only the automatic single-field array index.

import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

// Sentinel that marks a channel open to every approved user (seeded onto
// #general). MUST stay in sync with scripts/backfillChatChannels.js and the
// firestore.rules conversations read gate.
const ALL_APPROVED = "__all_approved__";

export function subscribeConversations({ currentUser, onUpdate, onError }) {
  if (!currentUser?.uid) {
    onUpdate({ channels: [], dms: [] });
    return () => {};
  }

  let channels = [];
  let dms = [];
  const emit = () => onUpdate({ channels, dms });

  // Channels. array-contains-any matches any channel whose allowedRoles
  // includes the user's role OR the open-to-all sentinel — the same field
  // the security rule inspects, so the list query is provably readable.
  const channelsQ = query(
    collection(db, "conversations"),
    where("type", "==", "channel"),
    where("allowedRoles", "array-contains-any", [currentUser.role, ALL_APPROVED])
  );
  const unsubChannels = onSnapshot(
    channelsQ,
    (snap) => {
      channels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    (err) => {
      console.error("[subscribeConversations] channels:", err);
      onError?.(err);
    }
  );

  // DMs.
  const dmsQ = query(
    collection(db, "conversations"),
    where("participantIds", "array-contains", currentUser.uid)
  );
  const unsubDms = onSnapshot(
    dmsQ,
    (snap) => {
      dms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    (err) => {
      console.error("[subscribeConversations] dms:", err);
      onError?.(err);
    }
  );

  return () => {
    unsubChannels();
    unsubDms();
  };
}
