"use client";

// Stage 4j — CSV export for reporting views.
//
// Each section becomes a small table with a "# title" comment row, then
// headers, then data rows, then a blank line. Excel/Sheets ignores the
// leading "#" row in display while still showing it; institutional
// readers get clear separators.

import { formatRangeISO } from "./services/dateUtils";

const escapeCell = (value) => {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
};

const sectionToLines = (section) => {
  const out = [];
  out.push(`# ${section.title}`);
  out.push(section.columns.map(escapeCell).join(","));
  for (const row of section.rows) {
    out.push(row.map(escapeCell).join(","));
  }
  out.push("");
  return out;
};

const triggerDownload = (content, filename) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Build a filename like "gimpa-report-Last-30-days-2025-06-05.csv".
const safeLabel = (s) => String(s || "report").replace(/[^a-zA-Z0-9-]+/g, "-");

export const exportToCsv = ({ filename, sections, period }) => {
  const lines = [];

  if (period) {
    lines.push(`# GIMPA Smart Resource Management Report`);
    lines.push(`# Period: ${period.label}`);
    lines.push(`# From: ${formatRangeISO(period.startDate)}`);
    lines.push(`# To: ${formatRangeISO(period.endDate)}`);
    lines.push("");
  }

  for (const section of sections) {
    if (!section || !section.columns || !section.rows) continue;
    for (const line of sectionToLines(section)) lines.push(line);
  }

  const fname = filename
    || `gimpa-report-${safeLabel(period?.label)}-${formatRangeISO(new Date())}.csv`;

  triggerDownload(lines.join("\n"), fname);
};
