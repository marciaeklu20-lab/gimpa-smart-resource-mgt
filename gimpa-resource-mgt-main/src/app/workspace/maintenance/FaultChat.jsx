"use client";

import { useEffect, useRef, useState } from "react";

import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import app from "@/firebase/config";

import { sendFaultMessage } from "./services/sendFaultMessage";
import { subscribeFaultMessages } from "./services/subscribeFaultMessages";

const db = getFirestore(app);

const formatTimestamp = (ts) => {
  // serverTimestamp() is null until the write commits server-side, so
  // optimistic snapshots can hit us with a missing createdAt for ~1
  // network round-trip.
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function FaultChat({ faultId, currentUser }) {

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const listRef = useRef(null);

  useEffect(() => {

    if (!faultId) return;

    const unsubscribe = subscribeFaultMessages({
      faultId,
      onUpdate: (msgs) => setMessages(msgs)
    });

    return unsubscribe;

  }, [faultId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Mark the fault as read by the current user whenever new messages
  // arrive that weren't authored by them. Mirrors BookingChat — same
  // unread-badge semantics will plug in here later without a refactor.
  useEffect(() => {

    if (!faultId || !currentUser?.uid) return;
    if (messages.length === 0) return;

    const latest = messages[messages.length - 1];
    if (latest?.authorId === currentUser.uid) return;

    updateDoc(
      doc(db, "faults", faultId),
      { [`lastReadByUser.${currentUser.uid}`]: serverTimestamp() }
    ).catch((err) => {
      // Non-fatal — viewing should still work even if the read receipt
      // write fails.
      console.error("Failed to mark fault as read:", err);
    });

  }, [messages.length, faultId, currentUser?.uid]);

  const handleSend = async () => {

    if (!text.trim() || sending) return;

    setSending(true);
    setError(null);

    try {

      await sendFaultMessage({
        faultId,
        text,
        user: currentUser
      });

      setText("");

    } catch (err) {

      console.error("Failed to send fault message:", err);
      setError("Could not send message. Please try again.");

    } finally {

      setSending(false);

    }

  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl + Enter sends; plain Enter inserts a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (

    <div className="fault-chat">

      <div className="fault-chat-header">
        <h4>Discussion</h4>
      </div>

      <div ref={listRef} className="fault-chat-messages">

        {messages.length === 0 ? (

          <div className="fault-chat-empty">
            No messages yet. Start a conversation.
          </div>

        ) : (

          messages.map((m) => {

            const mine = m.authorId === currentUser?.uid;

            return (

              <div
                key={m.id}
                className={`fault-chat-message ${mine ? "mine" : "theirs"}`}
              >

                <div className="fault-chat-meta">

                  <span className="fault-chat-author">
                    {m.authorName}
                  </span>

                  <span className="fault-chat-role">
                    {m.authorRole}
                  </span>

                  <span className="fault-chat-time">
                    {formatTimestamp(m.createdAt)}
                  </span>

                </div>

                <div className="fault-chat-body">
                  {m.text}
                </div>

              </div>

            );

          })

        )}

      </div>

      <div className="fault-chat-compose">

        <textarea
          className="fault-chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message…  (Cmd/Ctrl + Enter to send)"
          rows={2}
          maxLength={1000}
          disabled={sending}
        />

        <button
          type="button"
          className="fault-chat-send"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? "Sending…" : "Send"}
        </button>

      </div>

      {error && (
        <div className="fault-chat-error" role="alert">
          {error}
        </div>
      )}

    </div>

  );

}
