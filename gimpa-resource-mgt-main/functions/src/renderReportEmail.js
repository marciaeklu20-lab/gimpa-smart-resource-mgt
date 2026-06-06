// Stage 4l — weekly report email renderer.
//
// renderReportEmail(reportData, narrative) → { subject, html, text }
//
// Table-based HTML for email-client compatibility (Gmail/Outlook strip
// <style> and flexbox), with a plaintext fallback carrying the same
// content. Pure function — no SDK calls.

// Escape user/content-derived strings before interpolating into HTML.
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// "1 Jan" style short date from an ISO string.
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const metricRow = (label, value) => `
  <tr>
    <th align="left" style="padding: 8px 12px; font-size: 13px; font-weight: 500; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(label)}</th>
    <td align="right" style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(String(value))}</td>
  </tr>`;

export function renderReportEmail(reportData, narrative) {
  const data = reportData || {};
  const totals = data.totals || {};
  const period = data.period || {};
  const topResources = Array.isArray(data.topResources) ? data.topResources : [];
  const notableEvents = Array.isArray(data.notableEvents) ? data.notableEvents : [];

  const periodLabel =
    period.start && period.end
      ? `${shortDate(period.start)} – ${shortDate(period.end)}`
      : "past week";

  const generatedAt = new Date().toISOString();
  const narrativeText =
    typeof narrative === "string" && narrative.trim()
      ? narrative.trim()
      : "No narrative summary was generated for this period.";

  const subject = `GIMPA Resource Management — Weekly Report (${periodLabel})`;

  // Split the narrative into paragraphs for HTML rendering.
  const narrativeParas = narrativeText
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const narrativeHtml = narrativeParas
    .map(
      (p) =>
        `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #374151;">${esc(p)}</p>`
    )
    .join("");

  const topResourcesRows = topResources.length
    ? topResources
        .map(
          (r) => `
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(r.name || r.assetCode || "—")}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(String(r.bookings ?? 0))}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(String(r.faults ?? 0))}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">No resource activity this period.</td></tr>`;

  const notableEventsHtml = notableEvents.length
    ? `<ul style="margin: 0; padding-left: 20px;">${notableEvents
        .map(
          (e) =>
            `<li style="font-size: 13px; line-height: 1.6; color: #374151;">${esc(e)}</li>`
        )
        .join("")}</ul>`
    : `<p style="margin: 0; font-size: 13px; color: #9ca3af;">Nothing notable to flag this period.</p>`;

  const sectionHeading = (label) =>
    `<h2 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 24px 0 8px;">${esc(label)}</h2>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin: 0; padding: 24px 12px; background: #f3f4f6;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; width: 100%;">

    <tr>
      <td style="background: #4a6cf7; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Weekly Report</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">${esc(periodLabel)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px; background: white;">

        ${sectionHeading("Executive Summary")}
        ${narrativeHtml}

        ${sectionHeading("Activity at a glance")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          ${metricRow("Bookings", totals.bookings ?? 0)}
          ${metricRow("Faults reported", totals.faults ?? 0)}
          ${metricRow("Faults resolved", totals.resolvedFaults ?? 0)}
          ${metricRow("Supply requests", totals.supplyRequests ?? 0)}
          ${metricRow("New signups", totals.newSignups ?? 0)}
        </table>

        ${sectionHeading("Top resources by activity")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <th align="left" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Resource</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Bookings</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Faults</th>
          </tr>
          ${topResourcesRows}
        </table>

        ${sectionHeading("Notable events")}
        ${notableEventsHtml}

      </td>
    </tr>

    <tr>
      <td style="background: #f9fafb; padding: 16px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #6b7280;">
        Sent ${esc(generatedAt)}<br />
        Narrative generated by Llama 3.3 (Groq) · Delivery via Resend.
      </td>
    </tr>

  </table>
</body>
</html>`;

  // --- plaintext fallback ------------------------------------------
  const textLines = [
    `GIMPA Resource Management — Weekly Report (${periodLabel})`,
    "",
    "EXECUTIVE SUMMARY",
    narrativeText,
    "",
    "ACTIVITY AT A GLANCE",
    `  Bookings:        ${totals.bookings ?? 0}`,
    `  Faults reported: ${totals.faults ?? 0}`,
    `  Faults resolved: ${totals.resolvedFaults ?? 0}`,
    `  Supply requests: ${totals.supplyRequests ?? 0}`,
    `  New signups:     ${totals.newSignups ?? 0}`,
    "",
    "TOP RESOURCES BY ACTIVITY"
  ];

  if (topResources.length) {
    for (const r of topResources) {
      textLines.push(
        `  ${r.name || r.assetCode || "—"} — ${r.bookings ?? 0} bookings, ${r.faults ?? 0} faults`
      );
    }
  } else {
    textLines.push("  No resource activity this period.");
  }

  textLines.push("", "NOTABLE EVENTS");
  if (notableEvents.length) {
    for (const e of notableEvents) textLines.push(`  - ${e}`);
  } else {
    textLines.push("  Nothing notable to flag this period.");
  }

  textLines.push(
    "",
    `Sent ${generatedAt}`,
    "Narrative generated by Llama 3.3 (Groq). Delivery via Resend."
  );

  return { subject, html, text: textLines.join("\n") };
}
