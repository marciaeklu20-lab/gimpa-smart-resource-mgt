"use client";

// Stage 4p — client wrapper around the askAiBot callable. Simpler than
// aiInsights.js: each question is unique, so there is NO cache. Just a
// thin call + the same {code, message} error normalization shape so the
// panel can render code-aware messages.

import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";

const REGION = "europe-west1";

// Mirrors normalizeError in aiInsights.js — Firebase callable errors
// carry a `.code` like "functions/internal"; map to a small UI-friendly
// vocabulary.
const normalizeError = (err) => {
  const raw = err?.code || err?.message || "unknown";
  let code = "internal";
  if (typeof raw === "string") {
    if (raw.includes("unauthenticated")) code = "unauthenticated";
    else if (raw.includes("invalid-argument")) code = "invalid-input";
    else if (raw.includes("resource-exhausted") || raw.includes("rate")) code = "rate-limited";
  }
  return { code, message: err?.message || String(err) };
};

export async function askAiBot({ question, role, context }) {
  let payload;
  try {
    const functions = getFunctions(app, REGION);
    const fn = httpsCallable(functions, "askAiBot");
    const result = await fn({
      question,
      role: role || "user",
      context: context || {}
    });
    payload = result?.data || {};
  } catch (err) {
    const norm = normalizeError(err);
    const wrapped = new Error(norm.message);
    wrapped.code = norm.code;
    throw wrapped;
  }

  return {
    answer: typeof payload.answer === "string" ? payload.answer : "",
    references: Array.isArray(payload.references) ? payload.references : [],
    generatedAt: payload.generatedAt || new Date().toISOString()
  };
}
