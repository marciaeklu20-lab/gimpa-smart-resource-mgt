"use client";

// Stage 5 — real-time messages for one conversation, oldest-first. Single
// collection-group orderBy on createdAt → automatic single-field index.
// Capped at the most recent 500 (ascending) for MVP; pagination is
// Future Work.

import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export function subscribeMessages({ conversationId, onUpdate, onError }) {
  if (!conversationId) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc"),
    limit(500)
  );

  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("[subscribeMessages]:", err);
      onError?.(err);
    }
  );
}
