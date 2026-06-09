"use client";

// Stage 5 — right rail: header + scrolling message list + composer for the
// selected conversation. Auto-scrolls to the newest message on update.

import { useEffect, useRef, useState } from "react";

import { subscribeMessages } from "./subscribeMessages";
import MessageComposer from "./MessageComposer";

function tsMillis(t) {
  if (!t) return null;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
}

function formatTime(t) {
  const ms = tsMillis(t);
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function headerLabel(conversation, currentUser) {
  if (!conversation) return "";
  if (conversation.type === "channel") {
    return `# ${conversation.name || conversation.channelKey}`;
  }
  const otherUid = (conversation.participantIds || []).find((u) => u !== currentUser?.uid);
  const name =
    (conversation.participantNames && conversation.participantNames[otherUid]) ||
    "Direct message";
  return `@ ${name}`;
}

export default function MessageThread({ conversation, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!conversation?.id) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const unsub = subscribeMessages({
      conversationId: conversation.id,
      onUpdate: (msgs) => {
        setMessages(msgs);
        setLoading(false);
      },
      onError: () => setLoading(false)
    });
    return unsub;
  }, [conversation?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!conversation) {
    return (
      <div className="chat-thread chat-thread-empty">
        <p>Select a conversation to start messaging.</p>
      </div>
    );
  }

  return (
    <div className="chat-thread">
      <div className="chat-thread-header">
        <span className="chat-thread-title">{headerLabel(conversation, currentUser)}</span>
        {conversation.description && (
          <span className="chat-thread-desc">{conversation.description}</span>
        )}
      </div>

      <div className="chat-thread-messages" ref={scrollRef}>
        {loading && messages.length === 0 ? (
          <p className="chat-thread-status">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="chat-thread-status">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUser?.uid;
            return (
              <div key={m.id} className={`chat-message ${mine ? "mine" : ""}`}>
                {!mine && (
                  <div className="chat-message-meta">
                    <span className="chat-message-sender">{m.senderName}</span>
                    <span className="chat-message-role">{m.senderRole}</span>
                  </div>
                )}
                <div className="chat-message-bubble">{m.content}</div>
                <div className="chat-message-time">{formatTime(m.createdAt)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* key resets the composer's draft when switching conversations. */}
      <MessageComposer key={conversation.id} conversationId={conversation.id} />
    </div>
  );
}
