// Stage 4p — prompt builder for the AI availability bot (askAiBot).
//
// Pure string assembly: no API calls, no Firebase. Mirrors
// buildAiPrompt.js so the bot prompt can be unit-inspected without
// spinning up the function emulator.
//
// The context object is built client-side by buildBotContext.js and is
// already PII-scrubbed (no requester/reporter/custodian names, emails,
// or uids). The privacy guardrails below are a second line of defence
// in case a future context shape regresses.

const SCHEMA_BLOCK = `
{
  "answer": "string, max 600 chars — natural prose response",
  "references": ["EQP-001", "LAB-002"]
}
`.trim();

export function buildBotPrompt(question, role, context, currentDateTime) {
  const safeRole = String(role || "user");
  const safeWhen = String(currentDateTime || "now");

  return [
    "You are an AI assistant for GIMPA's Resource Management System.",
    "Answer questions about resource availability, bookings, faults,",
    "and supply requests using ONLY the data provided in the context",
    "below. NEVER invent resources, dates, or user names.",
    "",
    `Today is ${safeWhen}.`,
    `Audience role: ${safeRole}.`,
    "",
    "Rules:",
    "- If the question can be answered from the data: give a specific",
    "  answer with concrete resource names and times.",
    "- If the data is insufficient: say so honestly. Suggest where the",
    '  user could find the answer (e.g., "Check the Bookings tab").',
    "- If the question is outside the system's domain: politely",
    "  redirect.",
    '- Reference resources by their assetCode (e.g., "EQP-001") in',
    "  the references array so the UI can deep-link.",
    "- Keep answers concise — max 3 sentences. Output STRICT JSON.",
    "",
    "Privacy guardrails:",
    "- Do NOT mention any individual user identifiers, names, or",
    "  email addresses. Refer to bookings by resource and time only.",
    "",
    "Output STRICT JSON matching the schema below. No commentary, no",
    "markdown, no code fences.",
    "",
    "Schema:",
    SCHEMA_BLOCK,
    "",
    "Context (JSON):",
    JSON.stringify(context || {}),
    "",
    `Question: ${String(question || "")}`
  ].join("\n");
}
