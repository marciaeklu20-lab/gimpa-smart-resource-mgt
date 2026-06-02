"use client";

import { useEffect, useRef, useState } from "react";

import { sendBookingMessage } from "./services/sendBookingMessage";
import { subscribeBookingMessages } from "./services/subscribeBookingMessages";

import "@/app/styles/resource-management/booking-chat.css";

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

export default function BookingChat({ bookingId, currentUser }) {

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const listRef = useRef(null);

  useEffect(() => {

    if (!bookingId) return;

    const unsubscribe = subscribeBookingMessages({
      bookingId,
      onUpdate: (msgs) => setMessages(msgs)
    });

    return unsubscribe;

  }, [bookingId]);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {

    if (!text.trim() || sending) return;

    setSending(true);
    setError(null);

    try {

      await sendBookingMessage({
        bookingId,
        text,
        user: currentUser
      });

      setText("");

    } catch (err) {

      console.error("Failed to send message:", err);
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

    <div className="booking-chat">

      <div className="booking-chat-header">
        <h4>Discussion</h4>
      </div>

      <div ref={listRef} className="booking-chat-messages">

        {messages.length === 0 ? (

          <div className="booking-chat-empty">
            No messages yet. Start a conversation.
          </div>

        ) : (

          messages.map((m) => {

            const mine = m.authorId === currentUser?.uid;

            return (

              <div
                key={m.id}
                className={`booking-chat-message ${mine ? "mine" : "theirs"}`}
              >

                <div className="booking-chat-meta">

                  <span className="booking-chat-author">
                    {m.authorName}
                  </span>

                  <span className="booking-chat-role">
                    {m.authorRole}
                  </span>

                  <span className="booking-chat-time">
                    {formatTimestamp(m.createdAt)}
                  </span>

                </div>

                <div className="booking-chat-body">
                  {m.text}
                </div>

              </div>

            );

          })

        )}

      </div>

      <div className="booking-chat-compose">

        <textarea
          className="booking-chat-textarea"
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
          className="booking-chat-send"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? "Sending…" : "Send"}
        </button>

      </div>

      {error && (
        <div className="booking-chat-error" role="alert">
          {error}
        </div>
      )}

    </div>

  );

}
