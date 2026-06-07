// Stage 4l — weekly report email renderer.
//
// renderReportEmail(reportData, narrative, variant = "full")
//   → { subject, html, text }
//
// Two variants share one HTML shell (header band → content cell → footer
// band); only the subject, header copy, inner sections, and footer deep-
// link differ:
//   - "full"        : executive digest (bookings/faults/supply/signups)
//                     for all admin-level roles. Footer → /workspace/analytics
//   - "maintenance" : faults + supply + asset condition brief for
//                     Maintenance Admins. Footer → /workspace/maintenance
//
// Table-based HTML for email-client compatibility (Gmail/Outlook strip
// <style> and flexbox), with a plaintext fallback carrying the same
// content. Pure function — no SDK calls.

// Base URL for in-app deep links. Firebase Hosting default domain for the
// gimpa-resource-mgt project; override here if a custom domain is added.
const APP_BASE_URL = "https://gimpa-resource-mgt.web.app";

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

// Human label for a resource condition enum (mirrors resourceMeta.js;
// functions can't import from the Next src/ tree).
const CONDITION_LABELS = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  out_of_service: "Out of service"
};
const conditionLabel = (c) => CONDITION_LABELS[c] || c || "Unknown";

const metricRow = (label, value) => `
  <tr>
    <th align="left" style="padding: 8px 12px; font-size: 13px; font-weight: 500; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(label)}</th>
    <td align="right" style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(String(value))}</td>
  </tr>`;

const sectionHeading = (label) =>
  `<h2 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 24px 0 8px;">${esc(label)}</h2>`;

export function renderReportEmail(reportData, narrative, variant = "full") {
  const data = reportData || {};
  const totals = data.totals || {};
  const period = data.period || {};
  const breakdowns = data.breakdowns || {};
  const topResources = Array.isArray(data.topResources) ? data.topResources : [];
  const topFaultResources = Array.isArray(data.topFaultResources) ? data.topFaultResources : [];
  const notableEvents = Array.isArray(data.notableEvents) ? data.notableEvents : [];
  const faultsBySeverity = breakdowns.faultsBySeverity || {};
  const supply = data.supply || {};
  const supplyByStatus = supply.byStatus || {};
  const topSupplyItems = Array.isArray(supply.topItems) ? supply.topItems : [];
  const assetConditions = data.assetConditions || {};
  const conditionCounts = assetConditions.byCondition || {};
  const attention = Array.isArray(assetConditions.attention) ? assetConditions.attention : [];
  const attentionTotal = assetConditions.attentionTotal ?? attention.length;

  const isMaint = variant === "maintenance";

  const periodLabel =
    period.start && period.end
      ? `${shortDate(period.start)} – ${shortDate(period.end)}`
      : "past week";

  const generatedAt = new Date().toISOString();
  const narrativeText =
    typeof narrative === "string" && narrative.trim()
      ? narrative.trim()
      : "No narrative summary was generated for this period.";

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

  const subject = isMaint
    ? `GIMPA Maintenance Brief — ${periodLabel}`
    : `GIMPA Resource Management — Weekly Report (${periodLabel})`;

  const headerTitle = isMaint ? "Maintenance Brief" : "Weekly Report";
  const summaryHeading = isMaint ? "Maintenance overview" : "Executive Summary";
  const footerPath = isMaint ? "/workspace/maintenance" : "/workspace/analytics";
  const footerLabel = isMaint
    ? "Open the maintenance dashboard"
    : "Open analytics";
  const footerHref = `${APP_BASE_URL}${footerPath}`;

  const innerHtml = isMaint
    ? maintenanceInnerHtml({
        totals,
        faultsBySeverity,
        topFaultResources,
        supplyByStatus,
        topSupplyItems,
        conditionCounts,
        attention,
        attentionTotal
      })
    : fullInnerHtml({ totals, topResources, notableEvents });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin: 0; padding: 24px 12px; background: #f3f4f6;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; width: 100%;">

    <tr>
      <td style="background: #4a6cf7; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${esc(headerTitle)}</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">${esc(periodLabel)}</p>
      </td>
    </tr>

    <tr>
      <td style="padding: 24px; background: white;">

        ${sectionHeading(summaryHeading)}
        ${narrativeHtml}

        ${innerHtml}

      </td>
    </tr>

    <tr>
      <td style="background: #f9fafb; padding: 16px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #6b7280;">
        <a href="${esc(footerHref)}" style="color: #4a6cf7; text-decoration: none; font-weight: 600;">${esc(footerLabel)} →</a><br /><br />
        Sent ${esc(generatedAt)}<br />
        Narrative generated by Llama 3.3 (Groq) · Delivery via Resend.
      </td>
    </tr>

  </table>
</body>
</html>`;

  const text = isMaint
    ? maintenanceText({
        periodLabel,
        narrativeText,
        totals,
        faultsBySeverity,
        topFaultResources,
        supplyByStatus,
        topSupplyItems,
        conditionCounts,
        attention,
        attentionTotal,
        footerHref,
        generatedAt
      })
    : fullText({
        periodLabel,
        narrativeText,
        totals,
        topResources,
        notableEvents,
        footerHref,
        generatedAt
      });

  return { subject, html, text };
}

// =====================================================================
// FULL executive variant — unchanged layout from the original renderer.
// =====================================================================
function fullInnerHtml({ totals, topResources, notableEvents }) {
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

  return `
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
        ${notableEventsHtml}`;
}

function fullText({ periodLabel, narrativeText, totals, topResources, notableEvents, footerHref, generatedAt }) {
  const lines = [
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
      lines.push(
        `  ${r.name || r.assetCode || "—"} — ${r.bookings ?? 0} bookings, ${r.faults ?? 0} faults`
      );
    }
  } else {
    lines.push("  No resource activity this period.");
  }

  lines.push("", "NOTABLE EVENTS");
  if (notableEvents.length) {
    for (const e of notableEvents) lines.push(`  - ${e}`);
  } else {
    lines.push("  Nothing notable to flag this period.");
  }

  lines.push(
    "",
    `Open analytics: ${footerHref}`,
    `Sent ${generatedAt}`,
    "Narrative generated by Llama 3.3 (Groq). Delivery via Resend."
  );

  return lines.join("\n");
}

// =====================================================================
// MAINTENANCE variant — faults / supply / asset condition.
// =====================================================================
function maintenanceInnerHtml({
  totals,
  faultsBySeverity,
  topFaultResources,
  supplyByStatus,
  topSupplyItems,
  conditionCounts,
  attention,
  attentionTotal
}) {
  // --- faults section -----------------------------------------------
  const topFaultRows = topFaultResources.length
    ? topFaultResources
        .map(
          (r) => `
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(r.name || r.assetCode || "—")}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(String(r.faults ?? 0))}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="2" style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">No faults logged against a specific resource.</td></tr>`;

  const faultsSection = `
        ${sectionHeading("Faults this period")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          ${metricRow("Total reported", totals.faults ?? 0)}
          ${metricRow("Resolved", totals.resolvedFaults ?? 0)}
          ${metricRow("Still open", totals.pendingFaults ?? 0)}
          ${metricRow("Critical", faultsBySeverity.critical ?? 0)}
          ${metricRow("Major", faultsBySeverity.major ?? 0)}
          ${metricRow("Minor", faultsBySeverity.minor ?? 0)}
          ${metricRow("Cosmetic", faultsBySeverity.cosmetic ?? 0)}
        </table>

        ${sectionHeading("Most fault-prone resources")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <th align="left" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Resource</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Faults</th>
          </tr>
          ${topFaultRows}
        </table>`;

  // --- supply section -----------------------------------------------
  const topSupplyRows = topSupplyItems.length
    ? topSupplyItems
        .map(
          (it) => `
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(it.name || "—")}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(String(it.requests ?? 0))}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(String(it.quantity ?? 0))}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">No supply requests this period.</td></tr>`;

  const supplySection = `
        ${sectionHeading("Supply requests")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          ${metricRow("Pending", supplyByStatus.pending ?? 0)}
          ${metricRow("Approved", supplyByStatus.approved ?? 0)}
          ${metricRow("Fulfilled", supplyByStatus.fulfilled ?? 0)}
          ${metricRow("Denied", supplyByStatus.denied ?? 0)}
          ${metricRow("Cancelled", supplyByStatus.cancelled ?? 0)}
        </table>

        ${sectionHeading("Most-requested items")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <th align="left" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Item</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Requests</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qty</th>
          </tr>
          ${topSupplyRows}
        </table>`;

  // --- asset condition section --------------------------------------
  const attentionRows = attention.length
    ? attention
        .map(
          (a) => `
        <tr>
          <td style="padding: 8px 12px; font-size: 13px; color: #111827; border-bottom: 1px solid #f3f4f6;">${esc(a.name || a.assetCode || "—")}</td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${esc(conditionLabel(a.condition))}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="2" style="padding: 8px 12px; font-size: 13px; color: #9ca3af;">No assets currently flagged for attention.</td></tr>`;

  const hiddenAttention =
    attentionTotal > attention.length
      ? `<p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">…and ${esc(String(attentionTotal - attention.length))} more.</p>`
      : "";

  const conditionSection = `
        ${sectionHeading("Asset condition")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          ${metricRow("Excellent", conditionCounts.excellent ?? 0)}
          ${metricRow("Good", conditionCounts.good ?? 0)}
          ${metricRow("Fair", conditionCounts.fair ?? 0)}
          ${metricRow("Poor", conditionCounts.poor ?? 0)}
          ${metricRow("Out of service", conditionCounts.out_of_service ?? 0)}
        </table>

        ${sectionHeading("Resources needing attention")}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
          <tr>
            <th align="left" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Resource</th>
            <th align="right" style="padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Condition</th>
          </tr>
          ${attentionRows}
        </table>
        ${hiddenAttention}`;

  return `${faultsSection}\n${supplySection}\n${conditionSection}`;
}

function maintenanceText({
  periodLabel,
  narrativeText,
  totals,
  faultsBySeverity,
  topFaultResources,
  supplyByStatus,
  topSupplyItems,
  conditionCounts,
  attention,
  attentionTotal,
  footerHref,
  generatedAt
}) {
  const lines = [
    `GIMPA Maintenance Brief — ${periodLabel}`,
    "",
    "MAINTENANCE OVERVIEW",
    narrativeText,
    "",
    "FAULTS THIS PERIOD",
    `  Total reported: ${totals.faults ?? 0}`,
    `  Resolved:       ${totals.resolvedFaults ?? 0}`,
    `  Still open:     ${totals.pendingFaults ?? 0}`,
    `  Critical: ${faultsBySeverity.critical ?? 0}  Major: ${faultsBySeverity.major ?? 0}  Minor: ${faultsBySeverity.minor ?? 0}  Cosmetic: ${faultsBySeverity.cosmetic ?? 0}`,
    "",
    "MOST FAULT-PRONE RESOURCES"
  ];

  if (topFaultResources.length) {
    for (const r of topFaultResources) {
      lines.push(`  ${r.name || r.assetCode || "—"} — ${r.faults ?? 0} faults`);
    }
  } else {
    lines.push("  No faults logged against a specific resource.");
  }

  lines.push(
    "",
    "SUPPLY REQUESTS",
    `  Pending:   ${supplyByStatus.pending ?? 0}`,
    `  Approved:  ${supplyByStatus.approved ?? 0}`,
    `  Fulfilled: ${supplyByStatus.fulfilled ?? 0}`,
    `  Denied:    ${supplyByStatus.denied ?? 0}`,
    `  Cancelled: ${supplyByStatus.cancelled ?? 0}`,
    "",
    "MOST-REQUESTED ITEMS"
  );

  if (topSupplyItems.length) {
    for (const it of topSupplyItems) {
      lines.push(`  ${it.name || "—"} — ${it.requests ?? 0} requests, qty ${it.quantity ?? 0}`);
    }
  } else {
    lines.push("  No supply requests this period.");
  }

  lines.push(
    "",
    "ASSET CONDITION",
    `  Excellent: ${conditionCounts.excellent ?? 0}  Good: ${conditionCounts.good ?? 0}  Fair: ${conditionCounts.fair ?? 0}  Poor: ${conditionCounts.poor ?? 0}  Out of service: ${conditionCounts.out_of_service ?? 0}`,
    "",
    "RESOURCES NEEDING ATTENTION"
  );

  if (attention.length) {
    for (const a of attention) {
      lines.push(`  ${a.name || a.assetCode || "—"} — ${conditionLabel(a.condition)}`);
    }
    if (attentionTotal > attention.length) {
      lines.push(`  …and ${attentionTotal - attention.length} more.`);
    }
  } else {
    lines.push("  No assets currently flagged for attention.");
  }

  lines.push(
    "",
    `Open the maintenance dashboard: ${footerHref}`,
    `Sent ${generatedAt}`,
    "Narrative generated by Llama 3.3 (Groq). Delivery via Resend."
  );

  return lines.join("\n");
}
