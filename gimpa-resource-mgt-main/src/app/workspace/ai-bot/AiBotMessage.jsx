"use client";

// Stage 4p — a single chat bubble (user or bot). Bot messages with a
// non-empty references[] render small deep-link chips that navigate to
// the referenced resource's detail panel in Resource Management.

import React from "react";

export default function AiBotMessage({ message, navigate }) {

  const isUser = message?.role === "user";
  const references = Array.isArray(message?.references) ? message.references : [];

  const handleReference = (assetId) => {
    if (typeof navigate !== "function" || !assetId) return;
    // workspace navigate() reads `assetId` and forwards it to
    // CampusResource as initialAssetId — see workspace/page.jsx.
    navigate({
      sidebar: "Resource Management",
      tab: "Campus Resources",
      assetId
    });
  };

  return (
    <div
      className={`ai-bot-message ${isUser ? "ai-bot-message-user" : "ai-bot-message-bot"}`}
    >
      <span className="ai-bot-message-text">{message?.content}</span>

      {!isUser && references.length > 0 && (
        <div className="ai-bot-references">
          {references.map((ref) => (
            <button
              key={ref}
              type="button"
              className="ai-bot-reference-chip"
              onClick={() => handleReference(ref)}
            >
              → {ref}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
