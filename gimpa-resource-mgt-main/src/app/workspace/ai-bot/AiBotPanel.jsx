"use client";

// Stage 4p — the chat surface for the AI availability bot.
//
// Lazy data: this panel subscribes to resources/bookings/faults ONLY
// while it is mounted (i.e. open), and tears the listeners down on
// close. Nothing is hoisted to workspace-level state and nothing is
// cached — fresh data on every open is the whole point. The bookings
// and faults streams reuse the canonical role-aware subscribers
// (subscribeBookings / subscribeFaults) so Firestore rules are honoured
// without any rules changes; resources use a plain collection listener
// (the same read the resource list/picker already performs for every
// authenticated role).

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  getFirestore,
  collection,
  onSnapshot
} from "firebase/firestore";

import app from "@/firebase/config";

import { subscribeBookings } from "@/app/workspace/resource-management/services/subscribeBookings";
import { subscribeFaults } from "@/app/workspace/maintenance/services/subscribeFaults";

import { buildBotContext } from "./buildBotContext";
import { askAiBot } from "./aiBot";
import AiBotMessage from "./AiBotMessage";

const db = getFirestore(app);

const GREETING =
  "Hi! Ask me about resource availability, bookings, or maintenance. " +
  "For example: 'Is Lab 2 free Friday at 2pm?'";

const SUGGESTIONS = [
  "What rooms are available now?",
  "Show me my upcoming bookings",
  "Which vehicles are free tomorrow?",
  "Any open faults this week?"
];

const ERROR_REPLY =
  "I couldn't reach the AI service right now. Please try again in a moment.";

export default function AiBotPanel({ currentUser, navigate, onClose }) {

  const uid = currentUser?.uid;
  const role = currentUser?.role || "user";

  // --- Lazy, in-memory data streams ---------------------------------
  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [faults, setFaults] = useState([]);

  // Each stream flips its readiness flag on first emit (success OR
  // error). We only treat the bot as "connected" once all three have
  // reported, so the greeting doesn't appear over an empty context.
  const [ready, setReady] = useState({ resources: false, bookings: false, faults: false });
  const connected = ready.resources && ready.bookings && ready.faults;

  useEffect(() => {
    if (!uid) return;

    const markReady = (key) =>
      setReady((prev) => (prev[key] ? prev : { ...prev, [key]: true }));

    const unsubResources = onSnapshot(
      collection(db, "resources"),
      (snap) => {
        setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markReady("resources");
      },
      (err) => {
        console.error("[AiBotPanel] resources subscription error:", err);
        setResources([]);
        markReady("resources");
      }
    );

    const unsubBookings = subscribeBookings({
      user: currentUser,
      onUpdate: (list) => {
        setBookings(list);
        markReady("bookings");
      }
    });

    const unsubFaults = subscribeFaults({
      user: currentUser,
      onUpdate: (list) => {
        setFaults(list);
        markReady("faults");
      },
      onError: (err) => {
        console.error("[AiBotPanel] faults subscription error:", err);
        setFaults([]);
        markReady("faults");
      }
    });

    return () => {
      unsubResources();
      unsubBookings();
      unsubFaults();
    };
    // currentUser identity drives the role-aware queries; uid is the
    // stable key that actually matters for re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // --- Conversation state -------------------------------------------
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const idRef = useRef(0);
  const nextId = () => {
    idRef.current += 1;
    return `m-${idRef.current}`;
  };

  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, connected]);

  const greetingMessage = useMemo(
    () => ({
      id: "greeting",
      role: "bot",
      content: connected ? GREETING : "Connecting…",
      references: []
    }),
    [connected]
  );

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading || !connected) return;

    const userMsg = { id: nextId(), role: "user", content: question, references: [] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const context = buildBotContext({ resources, bookings, faults }, currentUser);
      const { answer, references } = await askAiBot({ question, role, context });
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "bot", content: answer, references }
      ]);
    } catch (err) {
      console.error("[AiBotPanel] askAiBot failed:", err);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "bot", content: ERROR_REPLY, references: [] }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text) => setInput(text);

  return (
    <div className="ai-bot-panel" role="dialog" aria-label="AI resource assistant">

      <div className="ai-bot-header">
        <h3>✨ Resource Assistant</h3>
        <button
          type="button"
          className="ai-bot-close"
          aria-label="Close AI assistant"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="ai-bot-messages">
        <AiBotMessage message={greetingMessage} navigate={navigate} />

        {messages.map((m) => (
          <AiBotMessage key={m.id} message={m} navigate={navigate} />
        ))}

        {loading && (
          <div className="ai-bot-typing" aria-label="Assistant is typing">
            <span className="ai-bot-typing-dot" />
            <span className="ai-bot-typing-dot" />
            <span className="ai-bot-typing-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-bot-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="ai-bot-suggestion-chip"
            onClick={() => handleSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="ai-bot-input-row">
        <input
          type="text"
          className="ai-bot-input"
          placeholder={connected ? "Type your question…" : "Connecting…"}
          value={input}
          disabled={!connected || loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="ai-bot-send"
          onClick={handleSend}
          disabled={!connected || loading || !input.trim()}
        >
          Send
        </button>
      </div>

    </div>
  );
}
