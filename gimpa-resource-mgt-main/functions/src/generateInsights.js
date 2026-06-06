// Stage 4q.2 — Gemini-backed callable that returns 3-5 narrative
// insights for the analytics period.
//
// Call shape (client → function):
//   { summary: object, role: string, periodLabel: string }
//
// Return shape (function → client):
//   { insights: [...], generatedAt: ISO string }
//
// Errors surface as HttpsError so the client receives a structured
// code/message pair rather than a 500.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Groq from "groq-sdk";

import { buildAiPrompt } from "./buildAiPrompt.js";

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const MODEL_ID = "llama-3.3-70b-versatile";

// ---------------------------------------------------------------------
// Response validation. The model is JSON-mode but we still defensively
// re-parse and shape-check before handing the array to the client.
// ---------------------------------------------------------------------

const ALLOWED_CATEGORIES = new Set([
  "usage", "maintenance", "supply", "lifecycle", "general"
]);
const ALLOWED_SEVERITIES = new Set(["info", "warning", "action"]);

function normalizeInsights(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    throw new HttpsError(
      "internal",
      "Gemini returned non-JSON output"
    );
  }

  const arr = parsed?.insights;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new HttpsError(
      "internal",
      "Gemini response missing insights array"
    );
  }

  // Clamp to 5 items, drop malformed ones rather than failing the
  // whole call. The UI handles a partially-empty array gracefully.
  const cleaned = [];
  for (let i = 0; i < arr.length && cleaned.length < 5; i++) {
    const it = arr[i] || {};
    const category = ALLOWED_CATEGORIES.has(it.category) ? it.category : "general";
    const severity = ALLOWED_SEVERITIES.has(it.severity) ? it.severity : "info";
    const title = typeof it.title === "string" ? it.title.slice(0, 120) : "";
    const description = typeof it.description === "string" ? it.description.slice(0, 240) : "";
    const rationale = typeof it.rationale === "string" ? it.rationale.slice(0, 180) : "";
    if (!title || !description) continue;
    cleaned.push({
      id: typeof it.id === "string" && it.id ? it.id : `ai-${cleaned.length + 1}`,
      category,
      severity,
      title,
      description,
      rationale
    });
  }

  if (cleaned.length < 3) {
    // Pad with the cleaned items we have — better than failing — but
    // surface a soft note in logs.
    console.warn(
      `[generateInsights] Gemini returned ${cleaned.length} usable insights — under minimum 3.`
    );
  }

  return cleaned;
}

// ---------------------------------------------------------------------
// Callable export.
// ---------------------------------------------------------------------

export const generateInsights = onCall(
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

    const { summary, role, periodLabel } = request.data || {};

    if (!summary || typeof summary !== "object") {
      throw new HttpsError("invalid-argument", "summary is required");
    }
    if (!role || typeof role !== "string") {
      throw new HttpsError("invalid-argument", "role is required");
    }
    if (!periodLabel || typeof periodLabel !== "string") {
      throw new HttpsError("invalid-argument", "periodLabel is required");
    }

    const prompt = buildAiPrompt(summary, role, periodLabel);

    let rawText;
    try {
      const groq = new Groq({ apiKey: GROQ_API_KEY.value() });
      const response = await groq.chat.completions.create({
        model: MODEL_ID,
        messages: [
          { role: "system", content: "You output only valid JSON with no markdown fences." },
          { role: "user",   content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });
      rawText = response.choices?.[0]?.message?.content;
    } catch (err) {
      console.error("[generateInsights] Groq call failed:", err);
      throw new HttpsError("internal", "AI generation failed");
    }

    if (!rawText) {
      throw new HttpsError("internal", "Gemini returned empty output");
    }

    const insights = normalizeInsights(rawText);

    return {
      insights,
      generatedAt: new Date().toISOString()
    };
  }
);
