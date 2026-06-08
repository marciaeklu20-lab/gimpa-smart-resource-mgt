/**
 * Cloud Functions entrypoint for GIMPA Resource Management.
 *
 * Exports:
 *   - notifyAdminOnPendingSignup
 *       Firestore-triggered (v2) function that fires when a new
 *       document is created in `users/{uid}`. If the new user is
 *       awaiting admin approval (`needsApproval === true`), it sends
 *       an email to the super-admin via Resend so they can review the
 *       request and approve/reject from the admin dashboard.
 *   - generateInsights  (Stage 4q.2)
 *       Callable function that takes a compact analytics summary +
 *       role + period label, asks Groq (Llama 3.3 70B) for 3-5
 *       narrative insights, and returns the validated JSON array.
 *       Definition lives in src/generateInsights.js to keep this index
 *       thin.
 *   - askAiBot  (Stage 4p)
 *       Callable function backing the floating AI availability bot.
 *       Takes a single question + role + a compact PII-scrubbed context
 *       payload, asks Groq (Llama 3.3 70B) for a grounded answer plus
 *       referenced resourceIds, and returns the validated result.
 *       Definition lives in src/askAiBot.js. Read-only — suggests
 *       actions but never performs them.
 *   - sendWeeklyReportsScheduled / sendWeeklyReportNow  (Stage 4l)
 *       Scheduled (Monday 09:00 UTC) + on-demand callable that build a
 *       7-day activity summary, ask Groq for a short narrative, render a
 *       table-based HTML email, and send it to all super_admins via
 *       Resend. The callable verifies super_admin role via a Firestore
 *       lookup. Both reuse the RESEND_API_KEY + GROQ_API_KEY secrets.
 *       Definition lives in src/sendWeeklyReports.js.
 *   - checkInResource  (Stage 4o Phase 2)
 *       Callable that records a resource's current location from the QR
 *       scan page. Verifies the caller is an approved user, resolves the
 *       chosen building to coordinates, and writes the move atomically
 *       (resource.currentLocation + a resourceMovements audit row) via
 *       the shared writeMovement helper. No secrets. Definition lives in
 *       src/checkInResource.js.
 *   - onFaultLogged / onFaultResolved / onResourceDocChanged /
 *     onBookingTransitions  (Stage 4o Phase 3)
 *       Event-driven movement listeners that reuse the same writeMovement
 *       helper to keep resource.currentLocation in step with what happens
 *       to the asset:
 *         · onFaultLogged — a major/critical fault moves the asset to the
 *           Maintenance Workshop.
 *         · onFaultResolved — resolving the fault returns it home.
 *         · onResourceDocChanged — one resources/{assetCode} update trigger:
 *           lifecycleStatus → archive moves, and home-location changes (from
 *           the client-side transferAsset service) → transfer moves. Single
 *           infinite-loop guard.
 *         · onBookingTransitions — scheduled (every 5 min): approved
 *           bookings move the asset to their bookingLocation at start and
 *           back home at end, advancing locationTransitionState atomically.
 *       All four run under the Admin SDK; no secrets, no PII beyond system
 *       role labels. Definitions live in src/movements/.
 *
 * Secrets:
 *   - RESEND_API_KEY — the Resend API key, stored as a Firebase
 *     Functions Secret (never in source). Shared by
 *     notifyAdminOnPendingSignup and the Stage 4l weekly reports.
 *   - GROQ_API_KEY — Groq Cloud API key, shared by generateInsights,
 *     askAiBot, and the Stage 4l weekly reports.
 *
 * Region:
 *   - europe-west1 (matches firebase.json frameworksBackend.region).
 *
 * Known limitation (parked):
 *   The Resend account is registered to a different Gmail address
 *   than the function's `to:` field. Resend's sandbox sender only
 *   delivers to the account-owner's email. Resolution paths:
 *     (a) recreate the Resend account using
 *         marcia.ea.geal@gmail.com OR
 *     (b) change `to:` to the Resend account email AND optionally
 *         set up Gmail auto-forwarding, OR
 *     (c) verify a custom domain in Resend.
 *   The function code, secret storage, Cloud Functions deploy, and
 *   Firestore trigger wiring are all correct — only the recipient
 *   mismatch blocks email delivery.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { Resend } from "resend";

// Stage 4q.2 — re-export the Groq-backed analytics insights callable.
// Keeping the definition in src/ avoids ballooning this file as more
// functions land; index.js stays the routing table.
export { generateInsights } from "./src/generateInsights.js";

// Stage 4p — Groq-backed AI availability bot. Single-turn, read-only
// Q&A grounded on the PII-scrubbed context the client sends. Reuses the
// same GROQ_API_KEY secret as generateInsights.
export { askAiBot } from "./src/askAiBot.js";

// Stage 4l — scheduled + on-demand weekly admin email reports. Both
// reuse the RESEND_API_KEY + GROQ_API_KEY secrets; the callable verifies
// super_admin role server-side via a Firestore lookup.
export {
  sendWeeklyReportsScheduled,
  sendWeeklyReportNow
} from "./src/sendWeeklyReports.js";

// Stage 4o Phase 2 — QR check-in callable. Records a resource's current
// location (currentLocation field + resourceMovements audit row) via the
// shared writeMovement helper. Verifies the caller is approved server-
// side. No new secrets.
export { checkInResource } from "./src/checkInResource.js";

// Stage 4o Phase 3 — event-driven movement listeners. Each reuses the
// shared writeMovement helper with its own `source`; no secrets.
export { onFaultLogged } from "./src/movements/onFaultLogged.js";
export { onFaultResolved } from "./src/movements/onFaultResolved.js";
export { onResourceDocChanged } from "./src/movements/onResourceDocChanged.js";
export { onBookingTransitions } from "./src/movements/onBookingTransitions.js";

const resendApiKey = defineSecret("RESEND_API_KEY");

export const notifyAdminOnPendingSignup = onDocumentCreated(
  {
    document: "users/{uid}",
    region: "europe-west1",
    secrets: [resendApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("[notifyAdminOnPendingSignup] No snapshot on event — skipping.");
      return;
    }

    const user = snapshot.data();

    if (!user || user.needsApproval !== true) {
      console.log(
        `[notifyAdminOnPendingSignup] User ${event.params.uid} does not need approval — skipping.`
      );
      return;
    }

    const fullName = user.fullName || "(no name provided)";
    const email = user.email || "(no email provided)";
    const role = user.role || "(no role)";
    const department = user.department || null;
    const position = user.position || null;
    const staffId = user.staffId || null;
    const studentId = user.studentId || null;

    const detailRow = (label, value) => `
      <tr>
        <td style="padding: 6px 12px 6px 0; color: #555; font-weight: 600; vertical-align: top;">${label}</td>
        <td style="padding: 6px 0; color: #111;">${value}</td>
      </tr>
    `;

    const rows = [
      detailRow("Name", fullName),
      detailRow("Email", email),
      detailRow("Role", role),
      department ? detailRow("Department", department) : "",
      position ? detailRow("Position", position) : "",
      staffId ? detailRow("Staff ID", staffId) : "",
      studentId ? detailRow("Student ID", studentId) : "",
    ].join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
        <h2 style="margin: 0 0 8px 0; color: #0b3c80;">New approval request</h2>
        <p style="margin: 0 0 20px 0; color: #444;">
          A new user has signed up and is awaiting admin approval.
        </p>

        <table style="border-collapse: collapse; width: 100%; margin-bottom: 24px; font-size: 14px;">
          ${rows}
        </table>

        <p style="margin: 0 0 24px 0; color: #111;">
          Log in to GRM to approve or reject this request.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

        <p style="margin: 0; font-size: 12px; color: #888;">
          GIMPA Resource Management System — Automated notification
        </p>
      </div>
    `;

    const subject = `New approval request: ${user.fullName || user.email}`;

    try {
      const resend = new Resend(resendApiKey.value());
      const result = await resend.emails.send({
        from: "GIMPA Resource Management <onboarding@resend.dev>",
        to: ["marcia.ea.geal@gmail.com"],
        subject,
        html,
      });

      // Resend's SDK returns { data, error } on validation/API failures
      // instead of throwing, so a non-null `error` here means the send
      // failed even though no exception was raised — log it as failure.
      if (result?.error) {
        console.error(
          `[notifyAdminOnPendingSignup] Resend rejected email for user ${event.params.uid}:`,
          result.error
        );
      } else {
        console.log(
          `[notifyAdminOnPendingSignup] Email sent for user ${event.params.uid}:`,
          result?.data ?? result
        );
      }
    } catch (err) {
      // Don't re-throw — a failed email shouldn't trigger Cloud Functions
      // retries (the user doc is already created; retries would just
      // spam errors and potentially duplicate emails).
      console.error(
        `[notifyAdminOnPendingSignup] Failed to send email for user ${event.params.uid}:`,
        err
      );
    }
  }
);
