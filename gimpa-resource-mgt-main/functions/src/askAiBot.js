// Stage 4p — Groq-backed callable for the AI availability bot.
//
// Single-turn Q&A. The client builds a compact, PII-scrubbed context
// payload from the data it already has subscribed (resources, bookings,
// faults) and sends it alongside the question; we ground the model on
// that context and return a short natural-language answer plus the
// resourceIds it referenced so the UI can deep-link.
//
// Call shape (client → function):
//   { question: string (1-500), role: string, context: object }
//
// Return shape (function → client):
//   { answer: string, references: string[], generatedAt: ISO string }
//
// Reuses the GROQ_API_KEY secret + llama-3.3-70b-versatile model from
// Stage 4q.2 (generateInsights) — no new secret.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Groq from "groq-sdk";

import { buildBotPrompt } from "./buildBotPrompt.js";

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const MODEL_ID = "llama-3.3-70b-versatile";

const MAX_ANSWER_CHARS = 600;

// ---------------------------------------------------------------------
// Collect every assetCode/resourceId that appears in the input context.
// The model is told to only reference these, but we filter server-side
// so a hallucinated id can never reach the deep-link UI.
// ---------------------------------------------------------------------
function collectContextIds(context) {
  const ids = new Set();
  const add = (v) => { if (typeof v === "string" && v) ids.add(v); };

  if (context && typeof context === "object") {
    for (const r of Array.isArray(context.resources) ? context.resources : []) {
      add(r?.assetCode);
    }
    for (const b of Array.isArray(context.upcomingBookings) ? context.upcomingBookings : []) {
      add(b?.resourceId);
    }
    for (const f of Array.isArray(context.openFaults) ? context.openFaults : []) {
      add(f?.resourceId);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------
// Response validation. The model is in JSON mode but we still defensively
// re-parse and shape-check before handing anything back to the client.
// ---------------------------------------------------------------------
function normalizeAnswer(raw, contextIds) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    throw new HttpsError("internal", "AI returned non-JSON output");
  }

  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  if (!answer) {
    throw new HttpsError("internal", "AI response missing answer");
  }

  const rawRefs = Array.isArray(parsed?.references) ? parsed.references : [];
  // Keep only string ids that actually exist in the context — drops
  // hallucinated ids and de-dupes while preserving order.
  const seen = new Set();
  const references = [];
  for (const ref of rawRefs) {
    if (typeof ref !== "string") continue;
    if (!contextIds.has(ref)) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    references.push(ref);
  }

  return {
    answer: answer.slice(0, MAX_ANSWER_CHARS),
    references
  };
}

// ---------------------------------------------------------------------
// Callable export.
// ---------------------------------------------------------------------

export const askAiBot = onCall(
  {
    region: "europe-west1",
    secrets: [GROQ_API_KEY],
    cors: true,
    timeoutSeconds: 60,
    maxInstances: 10
  },
  async (request) => {

    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }

    const { question, role, context } = request.data || {};

    if (typeof question !== "string" || question.trim().length < 1 || question.length > 500) {
      throw new HttpsError("invalid-argument", "question must be 1-500 characters");
    }
    if (!role || typeof role !== "string") {
      throw new HttpsError("invalid-argument", "role is required");
    }
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      throw new HttpsError("invalid-argument", "context object is required");
    }

    const currentDateTime = context.currentDateTime || new Date().toISOString();
    const prompt = buildBotPrompt(question.trim(), role, context, currentDateTime);

    let rawText;
    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY.value() });
      const response = await groq.chat.completions.create({
        model: MODEL_ID,
        messages: [
          { role: "system", content: "You output only valid JSON with no markdown fences." },
          { role: "user",   content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });
      rawText = response.choices?.[0]?.message?.content;
    } catch (err) {
      console.error("[askAiBot] Groq call failed:", err);
      throw new HttpsError("internal", "AI request failed");
    }

    if (!rawText) {
      throw new HttpsError("internal", "AI returned empty output");
    }

    const { answer, references } = normalizeAnswer(rawText, collectContextIds(context));

    return {
      answer,
      references,
      generatedAt: new Date().toISOString()
    };
  }
);
