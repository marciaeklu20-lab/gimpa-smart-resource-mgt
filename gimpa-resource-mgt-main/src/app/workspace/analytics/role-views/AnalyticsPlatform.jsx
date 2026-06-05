"use client";

// Stage 4j — Platform (institutional) view. Subscribes to every
// reporting collection once (bookings, faults, supplyRequests,
// resources), filters in-memory by the selected period, and renders
// 5 KPIs + 6 charts. Asset transfers are deferred (collection group
// query complication) per spec.

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  onSnapshot
} from "firebase/firestore";

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

import app from "@/firebase/config";

import PeriodSelector from "../PeriodSelector";
import KpiCard from "../KpiCard";
import {
  computePresetRange,
  priorPeriod,
  inPeriod
} from "../services/dateUtils";
import {
  getBookingTimestamp,
  getFaultReportTimestamp,
  getSupplyRequestTimestamp,
  bookingsOverTime,
  bookingsByCategory,
  bookingsByDepartment,
  faultsReportedVsResolved,
  supplyRequestsByStatus,
  conditionDistribution,
  uniqueActiveUsers,
  approvalRate,
  avgResolutionDays,
  formatNumber,
  formatPct,
  formatDaysOrHours
} from "../services/chartData";
import { exportToCsv } from "../exportCsv";
import { exportToPdf } from "../exportPdf";
import InsightsPanel from "../insights/InsightsPanel";
import { insightsExportSection } from "../insights/insightRules";

const db = getFirestore(app);

const STATUS_COLORS = {
  pending:   "#f59e0b",
  approved:  "#22c55e",
  fulfilled: "#15803d",
  rejected:  "#ef4444",
  denied:    "#b91c1c",
  cancelled: "#94a3b8"
};

export default function AnalyticsPlatform({ currentUser, navigate }) {

  const [period, setPeriod] = useState(() => computePresetRange("30"));

  const [bookings, setBookings] = useState([]);
  const [faults, setFaults] = useState([]);
  const [supplyRequests, setSupplyRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [error, setError] = useState(null);

  // Single subscription per collection — no per-period re-fetch.
  useEffect(() => {
    const unsubs = [];
    const guard = (setter) => (snap) => setter(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
    const onErr = (e) => setError(e.message || "Failed to load analytics");

    unsubs.push(onSnapshot(collection(db, "bookings"),       guard(setBookings),       onErr));
    unsubs.push(onSnapshot(collection(db, "faults"),         guard(setFaults),         onErr));
    unsubs.push(onSnapshot(collection(db, "supplyRequests"), guard(setSupplyRequests), onErr));
    unsubs.push(onSnapshot(collection(db, "resources"),      guard(setResources),      onErr));

    return () => unsubs.forEach((u) => u());
  }, []);

  // Compute current + prior period slices once per render. Each KPI
  // reduces over these instead of re-filtering.
  const slices = useMemo(() => {
    if (!period) return null;
    const prior = priorPeriod(period);
    return {
      bookingsCurr: inPeriod(bookings, getBookingTimestamp, period),
      bookingsPrev: inPeriod(bookings, getBookingTimestamp, prior),
      faultsCurr:   inPeriod(faults,   getFaultReportTimestamp, period),
      faultsPrev:   inPeriod(faults,   getFaultReportTimestamp, prior),
      supplyCurr:   inPeriod(supplyRequests, getSupplyRequestTimestamp, period),
      supplyPrev:   inPeriod(supplyRequests, getSupplyRequestTimestamp, prior)
    };
  }, [period, bookings, faults, supplyRequests]);

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

  const {
    bookingsCurr, bookingsPrev,
    faultsCurr, faultsPrev,
    supplyCurr, supplyPrev
  } = slices;

  // -----------------------------------------------------------------
  // KPIs
  // -----------------------------------------------------------------
  const totalBookingsCurr = bookingsCurr.length;
  const totalBookingsPrev = bookingsPrev.length;

  const approvalRateCurr = approvalRate(bookingsCurr);
  const approvalRatePrev = approvalRate(bookingsPrev);

  const resolvedCurr = faultsCurr.filter((f) => f.status === "resolved");
  const resolvedPrev = faultsPrev.filter((f) => f.status === "resolved");
  const avgResCurr = avgResolutionDays(resolvedCurr);
  const avgResPrev = avgResolutionDays(resolvedPrev);

  const supplyFulfilledCurr = supplyCurr.filter((r) => r.status === "fulfilled").length;
  const supplyFulfilledPrev = supplyPrev.filter((r) => r.status === "fulfilled").length;

  const activeUsersCurr = uniqueActiveUsers(bookingsCurr, faultsCurr);
  const activeUsersPrev = uniqueActiveUsers(bookingsPrev, faultsPrev);

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
  const { series: bookingsTimeline, bucketSize: bookingsBucketSize } =
    bookingsOverTime(bookingsCurr, period);
  const { series: faultsTimeline } =
    faultsReportedVsResolved(faultsCurr, period);
  const { series: supplyTimeline } =
    supplyRequestsByStatus(supplyCurr, period);
  const conditionData  = conditionDistribution(resources);
  const categoryData   = bookingsByCategory(bookingsCurr);
  const departmentData = bookingsByDepartment(bookingsCurr);

  // -----------------------------------------------------------------
  // Insights (Stage 4q) — bundle the raw data this view subscribes to
  // and let the rule engine derive findings. NO new Firestore reads.
  // -----------------------------------------------------------------
  const insightData = {
    bookings:       bookingsCurr,
    faults:         faultsCurr,
    supplyRequests: supplyCurr,
    resources
  };

  // -----------------------------------------------------------------
  // Exports
  // -----------------------------------------------------------------
  const buildSections = () => ([
    insightsExportSection(insightData, period, currentUser),
    {
      title: "Headline KPIs",
      columns: ["Metric", "Current", "Prior", "Δ"],
      rows: [
        ["Total bookings",            formatNumber(totalBookingsCurr),    formatNumber(totalBookingsPrev),    formatNumber(totalBookingsCurr - totalBookingsPrev)],
        ["Approval rate",             formatPct(approvalRateCurr),         formatPct(approvalRatePrev),         "—"],
        ["Avg fault resolution",      formatDaysOrHours(avgResCurr),       formatDaysOrHours(avgResPrev),       "—"],
        ["Supply requests fulfilled", formatNumber(supplyFulfilledCurr),   formatNumber(supplyFulfilledPrev),   formatNumber(supplyFulfilledCurr - supplyFulfilledPrev)],
        ["Unique active users",       formatNumber(activeUsersCurr),       formatNumber(activeUsersPrev),       formatNumber(activeUsersCurr - activeUsersPrev)]
      ]
    },
    {
      title:   `Bookings volume over time (${bookingsBucketSize} buckets)`,
      columns: ["Bucket", "Bookings", "Approved", "Pending", "Rejected"],
      rows:    bookingsTimeline.map((b) => [b.label, b.bookings, b.approved, b.pending, b.rejected])
    },
    {
      title:   "Faults reported vs resolved",
      columns: ["Bucket", "Reported", "Resolved"],
      rows:    faultsTimeline.map((b) => [b.label, b.reported, b.resolved])
    },
    {
      title:   "Supply requests by status",
      columns: ["Bucket", "Pending", "Approved", "Fulfilled", "Denied", "Cancelled"],
      rows:    supplyTimeline.map((b) => [b.label, b.pending, b.approved, b.fulfilled, b.denied, b.cancelled])
    },
    {
      title:   "Current asset condition distribution",
      columns: ["Condition", "Count"],
      rows:    conditionData.map((c) => [c.name, c.value])
    },
    {
      title:   "Bookings by category",
      columns: ["Category", "Count"],
      rows:    categoryData.map((c) => [c.name, c.value])
    },
    {
      title:   "Bookings by department",
      columns: ["Department", "Count"],
      rows:    departmentData.map((c) => [c.name, c.value])
    }
  ]);

  const handleExportCsv = () => exportToCsv({
    sections: buildSections(),
    period
  });

  const handleExportPdf = () => exportToPdf({
    title:    "Institutional Operations Report",
    sections: buildSections(),
    period,
    user:     currentUser
  });

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  return (
    <div className="analytics-container">

      <div className="analytics-header-row">
        <div>
          <h2 className="analytics-title">Institutional Analytics</h2>
          <p className="analytics-subtitle">
            Cross-platform reporting on bookings, maintenance, supply, and assets.
          </p>
        </div>

        <div className="analytics-export-row">
          <button type="button" className="analytics-export-btn" onClick={handleExportCsv}>
            Export CSV
          </button>
          <button type="button" className="analytics-export-btn analytics-export-pdf" onClick={handleExportPdf}>
            Export PDF
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
          label="Total bookings"
          value={formatNumber(totalBookingsCurr)}
          delta={deltaFor(totalBookingsCurr, totalBookingsPrev, "up")}
        />
        <KpiCard
          label="Approval rate"
          value={formatPct(approvalRateCurr)}
          sublabel={`${bookingsCurr.filter((b) => b.status !== "pending").length} decided`}
        />
        <KpiCard
          label="Avg fault resolution"
          value={formatDaysOrHours(avgResCurr)}
          sublabel={`${resolvedCurr.length} resolved`}
          delta={deltaFor(avgResCurr ?? 0, avgResPrev ?? 0, "down")}
        />
        <KpiCard
          label="Supply requests fulfilled"
          value={formatNumber(supplyFulfilledCurr)}
          delta={deltaFor(supplyFulfilledCurr, supplyFulfilledPrev, "up")}
        />
        <KpiCard
          label="Unique active users"
          value={formatNumber(activeUsersCurr)}
          delta={deltaFor(activeUsersCurr, activeUsersPrev, "up")}
        />
      </div>

      <div className="analytics-grid">

        <div className="analytics-chart-card analytics-chart-wide">
          <h3 className="analytics-chart-title">Bookings volume over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={bookingsTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bookings" name="Total" stroke="#4a6cf7" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="approved" name="Approved" stroke="#22c55e" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="pending"  name="Pending"  stroke="#f59e0b" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Faults reported vs resolved</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={faultsTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
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
          <h3 className="analytics-chart-title">Supply requests by status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={supplyTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="pending"   stackId="s" fill={STATUS_COLORS.pending}   name="Pending" />
              <Bar dataKey="approved"  stackId="s" fill={STATUS_COLORS.approved}  name="Approved" />
              <Bar dataKey="fulfilled" stackId="s" fill={STATUS_COLORS.fulfilled} name="Fulfilled" />
              <Bar dataKey="denied"    stackId="s" fill={STATUS_COLORS.denied}    name="Denied" />
              <Bar dataKey="cancelled" stackId="s" fill={STATUS_COLORS.cancelled} name="Cancelled" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Current asset condition (snapshot)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={conditionData}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={90}
                paddingAngle={2}
                label={(d) => d.value > 0 ? `${d.name}: ${d.value}` : ""}
              >
                {conditionData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings by category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 10, right: 20, left: 60, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={150} />
              <Tooltip />
              <Bar dataKey="value" fill="#4a6cf7" name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings by department</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={departmentData} layout="vertical" margin={{ top: 10, right: 20, left: 60, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={150} />
              <Tooltip />
              <Bar dataKey="value" fill="#1abc9c" name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );

}
