"use client";

// Stage 4j — Booker (lecturer / student) view. Scoped to the current
// user's own bookings + faults via `requesterId` / `reporterId`
// queries (matches Firestore rules; they don't have collection-wide
// read access).

import { useEffect, useMemo, useState } from "react";

import {
  getFirestore,
  collection,
  query,
  where,
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
  bookingsOverTime,
  bookingsByResource,
  bookingStatusBreakdown,
  approvalRate,
  totalHoursBooked,
  formatNumber,
  formatPct
} from "../services/chartData";
import { exportToCsv } from "../exportCsv";
import InsightsPanel from "../insights/InsightsPanel";
import { insightsExportSection } from "../insights/insightRules";

const db = getFirestore(app);

const STATUS_COLORS = {
  Approved: "#22c55e",
  Pending:  "#f59e0b",
  Rejected: "#ef4444"
};

export default function AnalyticsBooker({ currentUser, navigate }) {

  const uid = currentUser?.uid;

  const [period, setPeriod] = useState(() => computePresetRange("30"));

  const [bookings, setBookings] = useState([]);
  const [faults,   setFaults]   = useState([]);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!uid) return;
    const unsubs = [];
    const guard = (setter) => (snap) => setter(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
    const onErr = (e) => setError(e.message || "Failed to load analytics");

    unsubs.push(onSnapshot(
      query(collection(db, "bookings"), where("requesterId", "==", uid)),
      guard(setBookings), onErr
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "faults"), where("reporterId", "==", uid)),
      guard(setFaults), onErr
    ));

    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const slices = useMemo(() => {
    if (!period) return null;
    const prior = priorPeriod(period);
    return {
      bookingsCurr: inPeriod(bookings, getBookingTimestamp, period),
      bookingsPrev: inPeriod(bookings, getBookingTimestamp, prior),
      faultsCurr:   inPeriod(faults,   getFaultReportTimestamp, period),
      faultsPrev:   inPeriod(faults,   getFaultReportTimestamp, prior)
    };
  }, [period, bookings, faults]);

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

  const { bookingsCurr, bookingsPrev, faultsCurr, faultsPrev } = slices;

  // Stage 4q — Booker view feeds its own slice into the rule engine.
  // bookingVolumeChange is the primary rule that personalizes on
  // requesterId; other rules return null for this role bucket.
  const insightData = {
    bookings: bookingsCurr,
    faults:   faultsCurr,
    supplyRequests: [],
    resources: []
  };

  // -----------------------------------------------------------------
  // KPIs
  // -----------------------------------------------------------------
  const totalBookingsCurr = bookingsCurr.length;
  const totalBookingsPrev = bookingsPrev.length;
  const approvalRateCurr  = approvalRate(bookingsCurr);
  const hoursCurr         = totalHoursBooked(bookingsCurr);

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
  const { series: timeline }  = bookingsOverTime(bookingsCurr, period);
  const byResource            = bookingsByResource(bookingsCurr);
  const statusBreakdown       = bookingStatusBreakdown(bookingsCurr);

  // -----------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------
  const buildSections = () => ([
    insightsExportSection(insightData, period, currentUser),
    {
      title: "My activity KPIs",
      columns: ["Metric", "Current", "Prior"],
      rows: [
        ["My bookings",     formatNumber(totalBookingsCurr), formatNumber(totalBookingsPrev)],
        ["Approval rate",   formatPct(approvalRateCurr),     formatPct(approvalRate(bookingsPrev))],
        ["Faults reported", formatNumber(faultsCurr.length), formatNumber(faultsPrev.length)],
        ["Hours booked",    `${formatNumber(hoursCurr)} h`,  "—"]
      ]
    },
    {
      title:   "My bookings over time",
      columns: ["Bucket", "Bookings"],
      rows:    timeline.map((b) => [b.label, b.bookings])
    },
    {
      title:   "My bookings by resource (top 10)",
      columns: ["Resource", "Count"],
      rows:    byResource.map((r) => [r.name, r.value])
    },
    {
      title:   "My booking status breakdown",
      columns: ["Status", "Count"],
      rows:    statusBreakdown.map((s) => [s.name, s.value])
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
          <h2 className="analytics-title">My Activity</h2>
          <p className="analytics-subtitle">
            Booking + fault reporting trends for {currentUser?.fullName || "you"}.
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
          label="My bookings"
          value={formatNumber(totalBookingsCurr)}
          delta={deltaFor(totalBookingsCurr, totalBookingsPrev, "up")}
        />
        <KpiCard
          label="My approval rate"
          value={formatPct(approvalRateCurr)}
        />
        <KpiCard
          label="My faults reported"
          value={formatNumber(faultsCurr.length)}
          delta={deltaFor(faultsCurr.length, faultsPrev.length, "down")}
        />
        <KpiCard
          label="Total hours booked"
          value={`${formatNumber(hoursCurr)} h`}
        />
      </div>

      <div className="analytics-grid">

        <div className="analytics-chart-card analytics-chart-wide">
          <h3 className="analytics-chart-title">My bookings over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#4a6cf7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">By resource (top 10)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byResource} layout="vertical" margin={{ top: 10, right: 20, left: 60, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={150} />
              <Tooltip />
              <Bar dataKey="value" fill="#4a6cf7" name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Status breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={90}
                paddingAngle={2}
                label={(d) => d.value > 0 ? `${d.name}: ${d.value}` : ""}
              >
                {statusBreakdown.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );

}
