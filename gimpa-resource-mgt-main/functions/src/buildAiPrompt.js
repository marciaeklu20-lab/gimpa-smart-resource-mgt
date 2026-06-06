// Stage 4q.2 — Gemini prompt builder for the analytics insights call.
//
// Pure string assembly: no API calls, no Firebase. Lets us unit-test
// prompt shape without spinning up the function emulator.
//
// The summary object is built client-side by buildAiSummary.js. We
// trust its shape but defensively coerce missing fields to safe
// defaults so the model doesn't get NaN/undefined in the prompt body.

const SCHEMA_BLOCK = `
{
  "insights": [
    {
      "id": "ai-1",
      "category": "usage" | "maintenance" | "supply" | "lifecycle" | "general",
      "severity": "info" | "warning" | "action",
      "title": "string, max 80 chars",
      "description": "string, max 200 chars — specific and grounded",
      "rationale": "string, max 150 chars — why this matters"
    }
  ]
}
`.trim();

export function buildAiPrompt(summary, role, periodLabel) {
  const safeRole = String(role || "operator");
  const safePeriod = String(periodLabel || "the selected period");

  return [
    "You are an analytical assistant for an institutional resource",
    "management platform at GIMPA (Ghana Institute of Management and",
    "Public Administration).",
    "",
    "Generate 3-5 distinct, ACTIONABLE insights from the data summary",
    "provided. Each insight must reference specific numbers, resources,",
    "or trends from the data — DO NOT invent facts.",
    "",
    "Output STRICT JSON matching the schema below. No commentary, no",
    "markdown, no code fences.",
    "",
    "Schema:",
    SCHEMA_BLOCK,
    "",
    `Audience role: ${safeRole}. Period: ${safePeriod}.`,
    "",
    "Privacy guardrails:",
    "- Do NOT include any individual user identifiers, names, or email",
    "  addresses in your insights.",
    "- Refer to users only by aggregate counts.",
    "- If the data summary lists rule-based insights, generate findings",
    "  that COMPLEMENT them — do not restate the same finding verbatim.",
    "",
    "Data summary (JSON):",
    JSON.stringify(summary || {})
  ].join("\n");
}
