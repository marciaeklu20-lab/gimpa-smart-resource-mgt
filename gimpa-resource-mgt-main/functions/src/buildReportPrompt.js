// Stage 4l — prompt builder for the weekly report narrative.
//
// Pure string assembly, mirroring buildAiPrompt.js (4q.2) and
// buildBotPrompt.js (4p): no SDK calls, no Firebase. The reportData
// argument is already PII-scrubbed by buildReportData.js (aggregate
// counts + resource identifiers only); the privacy guardrails below are
// a second line of defence.

const SCHEMA_BLOCK = `
{
  "narrative": "string — 2 to 3 short paragraphs, max 200 words total"
}
`.trim();

// System block for the maintenance-scoped variant (Maintenance Admin
// recipients). Focuses on faults / supply / asset condition.
const MAINTENANCE_SYSTEM_BLOCK = [
  "You are writing the maintenance operations brief for the",
  "Maintenance Admin at GIMPA. Focus exclusively on faults,",
  "supply requests, and asset condition trends. Reference",
  "specific numbers — resolution times, fault counts, top",
  "issue-prone resources. Tone: operational, factual, no",
  "marketing fluff. 2-3 short paragraphs, max 200 words total.",
  "NEVER invent figures. NEVER include user names or emails."
];

// System block for the full executive variant (all other admin roles).
const FULL_SYSTEM_BLOCK = [
  "You are writing the executive summary section of a weekly",
  "institutional report for senior administrators at GIMPA.",
  "",
  "Write 2-3 short paragraphs (max 200 words total). Reference",
  "specific numbers and resources from the data. Tone: factual,",
  "professional, no marketing fluff. NEVER invent figures — use only",
  "the numbers present in the data below. NEVER include individual",
  "user names or emails; refer to user activity in aggregate counts",
  "only."
];

export function buildReportPrompt(reportData, variant = "full") {
  const data = reportData || {};
  const period = data.period || {};

  const periodLine =
    period.start && period.end
      ? `Reporting period: ${period.start} to ${period.end} (${period.days || 7} days).`
      : "Reporting period: the past week.";

  const systemBlock =
    variant === "maintenance" ? MAINTENANCE_SYSTEM_BLOCK : FULL_SYSTEM_BLOCK;

  return [
    ...systemBlock,
    "",
    periodLine,
    "",
    "Output STRICT JSON matching the schema below. No commentary, no",
    "markdown, no code fences.",
    "",
    "Schema:",
    SCHEMA_BLOCK,
    "",
    "Report data (JSON):",
    JSON.stringify(data)
  ].join("\n");
}
