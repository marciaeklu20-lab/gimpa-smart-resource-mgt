// Stage 4l — scheduled + on-demand weekly admin email reports.
//
// Two entry points, one pipeline (runWeeklyReport):
//   - sendWeeklyReportsScheduled : onSchedule, every Monday 09:00 UTC
//   - sendWeeklyReportNow        : onCall, admin-level "Send test report"
//
// Pipeline: buildReportData (7d aggregate) → Groq narrative →
// renderReportEmail → Resend to all admin-level addresses.
//
// Reuses the existing RESEND_API_KEY + GROQ_API_KEY secrets — no new
// secrets, no new Firestore collections (a reportRuns audit log is
// parked as Future Work).

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import Groq from "groq-sdk";

import { buildReportData } from "./buildReportData.js";
import { buildReportPrompt } from "./buildReportPrompt.js";
import { renderReportEmail } from "./renderReportEmail.js";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const MODEL_ID = "llama-3.3-70b-versatile";

// Stage 4l: admin-level roles. MUST stay in sync with ADMIN_LEVEL_ROLES
// in src/app/lib/roles.js — Cloud Functions can't easily import from the
// Next.js src/ tree, so the list is duplicated here.
const ADMIN_LEVEL_ROLES = new Set([
  "super_admin",
  "Secretariat Admin",
  "IT Officer",
  "Administrative Officer",
  "Higher Level Management",
  "Facility/Estate Officer",
  "Logistics Officer",
  "Stores/Inventory Officer",
  "Maintenance Admin"
]);

// Stage 4l demo-mode cap: Resend's sandbox tier (default
// onboarding@resend.dev sender) only delivers to the Resend
// account owner's verified email. Any other recipient gets
// rejected with 403 validation_error. Future Work: verify a
// gimpa.edu.gh (or similar) domain at resend.com/domains and
// remove this allow-list.
const DEMO_RECIPIENT_ALLOWLIST = new Set([
  "marcia.ea.geal@gmail.com"
]);

// Shared base options for both entry points.
const COMMON_OPTS = {
  region: "europe-west1",
  secrets: [RESEND_API_KEY, GROQ_API_KEY],
  timeoutSeconds: 540, // up to 9 min — Groq + Resend latency headroom
  memory: "512MiB"
};

if (!getApps().length) {
  initializeApp();
}

// ---------------------------------------------------------------------
// Scheduled — every Monday at 09:00 UTC.
// ---------------------------------------------------------------------
export const sendWeeklyReportsScheduled = onSchedule(
  {
    ...COMMON_OPTS,
    schedule: "0 9 * * 1",
    timeZone: "UTC"
  },
  async () => {
    await runWeeklyReport({ trigger: "scheduled" });
  }
);

// ---------------------------------------------------------------------
// Callable — admin clicks "Send test report". Verifies the caller holds
// an admin-level role via a Firestore lookup; never trusts a
// client-claimed role.
// ---------------------------------------------------------------------
export const sendWeeklyReportNow = onCall(
  {
    ...COMMON_OPTS,
    cors: true
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }

    const adminCheck = await ensureAdminLevel(request.auth.uid);
    if (!adminCheck.allowed) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    return runWeeklyReport({
      trigger: "manual",
      triggeredBy: request.auth.uid
    });
  }
);

// ---------------------------------------------------------------------
// Pipeline.
// ---------------------------------------------------------------------
async function runWeeklyReport({ trigger }) {
  const reportData = await buildReportData({ periodDays: 7 });

  // Skip entirely if nothing happened — avoids weekly noise during
  // quiet periods (holidays etc.).
  const t = reportData.totals;
  if (
    t.bookings === 0 &&
    t.faults === 0 &&
    t.supplyRequests === 0 &&
    t.newSignups === 0
  ) {
    console.info("[sendWeeklyReports] Skipping — no activity this period");
    return {
      sentTo: 0,
      generatedAt: new Date().toISOString(),
      skipped: true
    };
  }

  const narrative = await generateNarrative(reportData);
  const { html, text, subject } = renderReportEmail(reportData, narrative);

  const allRecipients = await getAdminLevelEmails();
  const recipients = allRecipients.filter((e) =>
    DEMO_RECIPIENT_ALLOWLIST.has(e)
  );
  const skipped = allRecipients.length - recipients.length;
  if (skipped > 0) {
    console.info(
      `[sendWeeklyReports] Demo-mode allow-list filtered ${skipped} ` +
      `recipient(s); delivering to ${recipients.length}`
    );
  }

  if (recipients.length === 0) {
    console.warn("[sendWeeklyReports] No recipients after allow-list filter");
    return { sentTo: 0, generatedAt: new Date().toISOString() };
  }

  const resend = new Resend(RESEND_API_KEY.value());
  const result = await resend.emails.send({
    from: "GIMPA Resource Management <onboarding@resend.dev>",
    to: recipients,
    subject,
    html,
    text,
    tags: [
      { name: "kind", value: "weekly-report" },
      { name: "trigger", value: trigger }
    ]
  });

  // Resend returns { data, error } rather than throwing on API/validation
  // failures — surface a non-null error as a failed send.
  if (result?.error) {
    console.error("[sendWeeklyReports] Resend rejected the send:", result.error);
    throw new HttpsError("internal", "Email provider rejected the report");
  }

  console.info(`[sendWeeklyReports] Sent to ${recipients.length} (${trigger})`);
  return {
    sentTo: recipients.length,
    generatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------
// Groq narrative. Falls back to a deterministic summary sentence if the
// model errors or returns junk — a narrative hiccup shouldn't block the
// metrics email.
// ---------------------------------------------------------------------
async function generateNarrative(reportData) {
  const prompt = buildReportPrompt(reportData);

  try {
    const groq = new Groq({ apiKey: GROQ_API_KEY.value() });
    const response = await groq.chat.completions.create({
      model: MODEL_ID,
      messages: [
        { role: "system", content: "You output only valid JSON with no markdown fences." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 600,
      response_format: { type: "json_object" }
    });

    const raw = response.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    const narrative =
      typeof parsed?.narrative === "string" ? parsed.narrative.trim() : "";

    if (narrative) return narrative;
    console.warn("[sendWeeklyReports] Groq returned empty narrative — using fallback");
  } catch (err) {
    console.error("[sendWeeklyReports] Narrative generation failed — using fallback:", err);
  }

  return fallbackNarrative(reportData);
}

function fallbackNarrative(reportData) {
  const t = reportData.totals || {};
  return (
    `This week saw ${t.bookings ?? 0} bookings, ${t.faults ?? 0} faults reported ` +
    `(${t.resolvedFaults ?? 0} resolved), ${t.supplyRequests ?? 0} supply requests, ` +
    `and ${t.newSignups ?? 0} new signups.`
  );
}

// ---------------------------------------------------------------------
// Role + recipient lookups (Admin SDK).
// ---------------------------------------------------------------------
async function ensureAdminLevel(uid) {
  try {
    const snap = await getFirestore().collection("users").doc(uid).get();
    const role = snap.exists ? snap.data()?.role : null;
    return { allowed: ADMIN_LEVEL_ROLES.has(role), role };
  } catch (err) {
    console.error("[sendWeeklyReports] admin-level check failed:", err);
    return { allowed: false, role: null };
  }
}

async function getAdminLevelEmails() {
  // Firestore "in" queries cap at 30 values; we pass 9 — plenty of
  // headroom. If ADMIN_LEVEL_ROLES ever grows past 30, chunk this into
  // batched queries. Combining "in" (role) with "==" (approved) needs a
  // composite index — add one in the Firebase console if the query errors.
  const snap = await getFirestore()
    .collection("users")
    .where("role", "in", Array.from(ADMIN_LEVEL_ROLES))
    .where("approved", "==", true)
    .get();

  const seen = new Set();
  const emails = [];
  snap.forEach((doc) => {
    const email = doc.data()?.email;
    if (typeof email === "string" && email.includes("@") && !seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  });
  return emails;
}
