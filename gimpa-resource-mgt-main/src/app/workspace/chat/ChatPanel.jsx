"use client";

// Stage 5 — Chat panel. Orchestrates the left rail (ConversationList) and
// the right rail (MessageThread), owns the selected-conversation state,
// subscribes to the user's read-state for unread dots, and brokers DM
// creation through the createOrFindDmConversation callable.

import { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";
import { subscribeConversations } from "./subscribeConversations";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import UserPicker from "./UserPicker";

import "@/app/styles/chat/Chat.css";

const db = getFirestore(app);
const REGION = "europe-west1";

export default function ChatPanel({ currentUser }) {
  const [channels, setChannels] = useState([]);
  const [dms, setDms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lastRead, setLastRead] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live channels + DMs.
  useEffect(() => {
    if (!currentUser?.uid) return;
    setLoading(true);
    const unsub = subscribeConversations({
      currentUser,
      onUpdate: ({ channels, dms }) => {
        setChannels(channels);
        setDms(dms);
        setLoading(false);
      },
      onError: () => setLoading(false)
    });
    return unsub;
  }, [currentUser?.uid, currentUser?.role]);

  // Live per-user read state (drives unread dots).
  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = doc(db, "userChatState", currentUser.uid);
    return onSnapshot(
      ref,
      (snap) => setLastRead(snap.exists() ? (snap.data().lastRead || {}) : {}),
      (err) => console.error("[ChatPanel] userChatState:", err)
    );
  }, [currentUser?.uid]);

  // Auto-select General once channels load, if nothing is selected yet.
  useEffect(() => {
    if (selectedId || !channels.length) return;
    const general = channels.find((c) => c.channelKey === "general") || channels[0];
    if (general) setSelectedId(general.id);
  }, [channels, selectedId]);

  const allConversations = useMemo(() => [...channels, ...dms], [channels, dms]);
  const selected = allConversations.find((c) => c.id === selectedId) || null;

  // Mark a conversation read when it becomes selected, and again whenever a
  // new message arrives while it's the open one (so its badge clears live).
  useEffect(() => {
    if (!selected?.id || !currentUser?.uid) return;
    setDoc(
      doc(db, "userChatState", currentUser.uid),
      { lastRead: { [selected.id]: serverTimestamp() } },
      { merge: true }
    ).catch((err) => console.error("[ChatPanel] markRead:", err));
  }, [selected?.id, selected?.lastMessageAt, currentUser?.uid]);

  const handleStartDm = async (targetUid) => {
    setPickerOpen(false);
    try {
      const functions = getFunctions(app, REGION);
      const fn = httpsCallable(functions, "createOrFindDmConversation");
      const res = await fn({ targetUid });
      if (res?.data?.conversationId) {
        setSelectedId(res.data.conversationId);
      }
    } catch (err) {
      console.error("[ChatPanel] createOrFindDm:", err);
      alert("Could not start the conversation. Please try again.");
    }
  };

  return (
    <div className="chat-panel">
      <ConversationList
        channels={channels}
        dms={dms}
        currentUser={currentUser}
        selectedId={selectedId}
        lastRead={lastRead}
        loading={loading}
        onSelect={setSelectedId}
        onNewDm={() => setPickerOpen(true)}
      />
      <MessageThread conversation={selected} currentUser={currentUser} />
      {pickerOpen && (
        <UserPicker
          currentUser={currentUser}
          onPick={handleStartDm}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
