"use client";

// Stage 4j — Maintenance-team operations view. Maintenance Staff /
// Admin can read all faults + supply requests via existing rules
// (canSeeFault / canSeeSupplyRequest both branch on
// isMaintenanceStaff), so collection listeners are fine here.

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  onSnapshot
} from "firebase/firestore";

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

import app from "@/firebase/config";

import PeriodSelector from "../PeriodSelector";
import KpiCard from "../KpiCard";
import {
  computePresetRange,
  priorPeriod,
  inPeriod,
  toDate
} from "../services/dateUtils";
import {
  getFaultReportTimestamp,
  getFaultResolutionTimestamp,
  getSupplyRequestTimestamp,
  faultsReportedVsResolved,
  faultsBySeverityOverTime,
  avgResolutionDays,
  avgAcknowledgeHours,
  formatNumber,
  formatDaysOrHours
} from "../services/chartData";
import { exportToCsv } from "../exportCsv";
import InsightsPanel from "../insights/InsightsPanel";
import { insightsExportSection } from "../insights/insightRules";

const db = getFirestore(app);

const SEVERITY_COLORS = {
  critical: "#ef4444",
  major:    "#f97316",
  minor:    "#f59e0b",
  cosmetic: "#facc15"
};

// Compute a moving-average of fault resolution time, bucketed weekly.
// One point per week with the average of all faults RESOLVED in that
// week. Used by the Resolution-time-trend chart.
const resolutionTimeTrend = (faults, period) => {
  const resolved = faults.filter(
    (f) => f.status === "resolved" && f.resolvedAt
  );

  const inRange = inPeriod(resolved, getFaultResolutionTimestamp, period);

  const buckets = new Map();
  for (const f of inRange) {
    const resolvedDate = toDate(getFaultResolutionTimestamp(f));
    const reportedDate = toDate(getFaultReportTimestamp(f));
    if (!resolvedDate || !reportedDate) continue;

    const days = (resolvedDate.getTime() - reportedDate.getTime()) / (1000 * 60 * 60 * 24);

    // Week-of bucket key (Monday-start).
    const day = resolvedDate.getDay();
    const monOffset = (day + 6) % 7;
    const monday = new Date(resolvedDate);
    monday.setDate(monday.getDate() - monOffset);
    monday.setHours(0, 0, 0, 0);
    const key = monday.toISOString().slice(0, 10);

    if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, monday });
    const b = buckets.get(key);
    b.sum += days;
    b.count += 1;
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.monday.getTime() - b.monday.getTime())
    .map((b) => ({
      label: `W/c ${b.monday.getDate().toString().padStart(2, "0")} ${b.monday.toLocaleString("en-GB", { month: "short" })}`,
      days:  Number((b.sum / b.count).toFixed(2))
    }));
};

export default function AnalyticsMaintenance({ currentUser, navigate }) {

  const [period, setPeriod] = useState(() => computePresetRange("30"));

  const [faults, setFaults] = useState([]);
  const [supplyRequests, setSupplyRequests] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubs = [];
    const guard = (setter) => (snap) => setter(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
    const onErr = (e) => setError(e.message || "Failed to load analytics");

    unsubs.push(onSnapshot(collection(db, "faults"),         guard(setFaults),         onErr));
    unsubs.push(onSnapshot(collection(db, "supplyRequests"), guard(setSupplyRequests), onErr));

    return () => unsubs.forEach((u) => u());
  }, []);

  const slices = useMemo(() => {
    if (!period) return null;
    const prior = priorPeriod(period);
    return {
      faultsCurr: inPeriod(faults, getFaultReportTimestamp, period),
      faultsPrev: inPeriod(faults, getFaultReportTimestamp, prior),
      supplyCurr: inPeriod(supplyRequests, getSupplyRequestTimestamp, period),
      supplyPrev: inPeriod(supplyRequests, getSupplyRequestTimestamp, prior)
    };
  }, [period, faults, supplyRequests]);

  if (error) {
    return (
      <div className="analytics-container">
        <div className="analytics-error">Could not load analytics: {error}</div>
      </div>
    );
  }

  if (!slices) {
    return (
      <div className="analytics-container">
        <div className="analytics-loading">Loading analytics…</div>
      </div>
    );
  }

  const { faultsCurr, faultsPrev, supplyCurr, supplyPrev } = slices;

  // Stage 4q — Maintenance view feeds its slice into the rule engine.
  // Resources aren't subscribed in this view (faults already carry
  // resourceName), so we pass an empty array and let rules that need
  // resources gracefully return null.
  const insightData = {
    bookings:       [],
    faults:         faultsCurr,
    supplyRequests: supplyCurr,
    resources:      []
  };

  // -----------------------------------------------------------------
  // KPIs
  // -----------------------------------------------------------------
  const resolvedCurr = faultsCurr.filter((f) => f.status === "resolved");
  const resolvedPrev = faultsPrev.filter((f) => f.status === "resolved");

  const avgResCurr = avgResolutionDays(resolvedCurr);
  const avgResPrev = avgResolutionDays(resolvedPrev);

  const avgAckCurr = avgAcknowledgeHours(faultsCurr);
  const avgAckPrev = avgAcknowledgeHours(faultsPrev);

  const deltaFor = (current, previous, isGoodWhen = "up") => {
    const deltaAbs = (current ?? 0) - (previous ?? 0);
    let pct = null;
    if (previous && previous !== 0) pct = (deltaAbs / Math.abs(previous)) * 100;
    else if (current === 0 && previous === 0) pct = 0;
    const direction = deltaAbs > 0 ? "up" : deltaAbs < 0 ? "down" : "flat";
    return { direction, deltaPct: pct, isGoodWhen };
  };

  // -----------------------------------------------------------------
  // Chart data
  // -----------------------------------------------------------------
  const { series: timeline }     = faultsReportedVsResolved(faultsCurr, period);
  const { series: severity }     = faultsBySeverityOverTime(faultsCurr, period);
  const resolutionTrend          = resolutionTimeTrend(faults, period);

  // -----------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------
  const buildSections = () => ([
    insightsExportSection(insightData, period, currentUser),
    {
      title: "Maintenance KPIs",
      columns: ["Metric", "Current", "Prior"],
      rows: [
        ["Faults received",       formatNumber(faultsCurr.length),    formatNumber(faultsPrev.length)],
        ["Faults resolved",       formatNumber(resolvedCurr.length),  formatNumber(resolvedPrev.length)],
        ["Avg time-to-acknowledge", formatDaysOrHours(avgAckCurr / 24 || null), formatDaysOrHours(avgAckPrev / 24 || null)],
        ["Avg time-to-resolve",   formatDaysOrHours(avgResCurr),      formatDaysOrHours(avgResPrev)],
        ["Supply requests submitted", formatNumber(supplyCurr.length),  formatNumber(supplyPrev.length)]
      ]
    },
    {
      title:   "Faults reported vs resolved over time",
      columns: ["Bucket", "Reported", "Resolved"],
      rows:    timeline.map((b) => [b.label, b.reported, b.resolved])
    },
    {
      title:   "Faults by severity",
      columns: ["Bucket", "Critical", "Major", "Minor", "Cosmetic"],
      rows:    severity.map((b) => [b.label, b.critical, b.major, b.minor, b.cosmetic])
    },
    {
      title:   "Resolution time trend (weekly average)",
      columns: ["Week", "Avg days"],
      rows:    resolutionTrend.map((p) => [p.label, p.days])
    }
  ]);

  const handleExportCsv = () => exportToCsv({
    sections: buildSections(),
    period
  });

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  return (
    <div className="analytics-container">

      <div className="analytics-header-row">
        <div>
          <h2 className="analytics-title">Maintenance Operations</h2>
          <p className="analytics-subtitle">
            Fault throughput, resolution time, and supply-request volume.
          </p>
        </div>
        <div className="analytics-export-row">
          <button type="button" className="analytics-export-btn" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      <InsightsPanel
        data={insightData}
        period={period}
        currentUser={currentUser}
        navigate={navigate}
      />

      <div className="analytics-kpi-row">
        <KpiCard
          label="Faults received"
          value={formatNumber(faultsCurr.length)}
          delta={deltaFor(faultsCurr.length, faultsPrev.length, "down")}
        />
        <KpiCard
          label="Faults resolved"
          value={formatNumber(resolvedCurr.length)}
          delta={deltaFor(resolvedCurr.length, resolvedPrev.length, "up")}
        />
        <KpiCard
          label="Avg time-to-acknowledge"
          value={avgAckCurr == null ? "—" : `${avgAckCurr.toFixed(1)} hrs`}
          delta={deltaFor(avgAckCurr ?? 0, avgAckPrev ?? 0, "down")}
        />
        <KpiCard
          label="Avg time-to-resolve"
          value={formatDaysOrHours(avgResCurr)}
          delta={deltaFor(avgResCurr ?? 0, avgResPrev ?? 0, "down")}
        />
        <KpiCard
          label="Supply requests submitted"
          value={formatNumber(supplyCurr.length)}
          delta={deltaFor(supplyCurr.length, supplyPrev.length, "up")}
        />
      </div>

      <div className="analytics-grid">

        <div className="analytics-chart-card analytics-chart-wide">
          <h3 className="analytics-chart-title">Faults reported vs resolved</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="reported" name="Reported" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Faults by severity over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={severity} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="critical" stackId="s" fill={SEVERITY_COLORS.critical} name="Critical" />
              <Bar dataKey="major"    stackId="s" fill={SEVERITY_COLORS.major}    name="Major" />
              <Bar dataKey="minor"    stackId="s" fill={SEVERITY_COLORS.minor}    name="Minor" />
              <Bar dataKey="cosmetic" stackId="s" fill={SEVERITY_COLORS.cosmetic} name="Cosmetic" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Resolution time trend (weekly)</h3>
          {resolutionTrend.length === 0 ? (
            <div className="analytics-empty-inline">
              No resolved faults in the selected period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={resolutionTrend} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="days" name="Avg days" stroke="#4a6cf7" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

    </div>
  );

}
