"use client";

// Stage 4p — floating launcher for the AI availability bot. Renders a
// fixed bottom-right button on every authenticated page; clicking it
// opens the chat panel. Hidden entirely when there is no signed-in user
// (so it never shows on logout / the auth pages).
//
// The panel owns its own lazy data subscriptions — this component only
// owns open/closed state and passes through currentUser + navigate.

import React, { useState } from "react";

import AiBotPanel from "./AiBotPanel";

import "@/app/styles/ai-bot/AiBot.css";

export default function AiBotButton({ currentUser, navigate }) {

  const [isOpen, setIsOpen] = useState(false);

  if (!currentUser?.uid) return null;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          className="ai-bot-trigger"
          aria-label="Open AI assistant"
          onClick={() => setIsOpen(true)}
        >
          ✨
        </button>
      )}

      {isOpen && (
        <AiBotPanel
          currentUser={currentUser}
          navigate={navigate}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
