"use client";

// Stage 5 — message input. Enter sends, Shift+Enter inserts a newline. The
// actual write goes through the sendMessage callable (Admin SDK) — the
// client never writes to conversations/*/messages directly.

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";

const REGION = "europe-west1";
const MAX_LEN = 2000; // keep in sync with functions/src/chat/sendMessage.js

export default function MessageComposer({ conversationId }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (trimmed.length > MAX_LEN) {
      alert(`Message too long (max ${MAX_LEN} characters).`);
      return;
    }
    setSending(true);
    try {
      const functions = getFunctions(app, REGION);
      const fn = httpsCallable(functions, "sendMessage");
      await fn({ conversationId, content: trimmed });
      setText("");
    } catch (err) {
      console.error("[MessageComposer] send:", err);
      alert("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-composer">
      <textarea
        className="chat-composer-input"
        placeholder="Type a message…  (Enter to send, Shift+Enter for a new line)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={sending}
      />
      <button
        type="button"
        className="chat-composer-send"
        onClick={send}
        disabled={sending || !text.trim()}
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
