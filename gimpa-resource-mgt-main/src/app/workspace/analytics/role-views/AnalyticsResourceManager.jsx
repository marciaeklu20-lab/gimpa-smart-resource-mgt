"use client";

// Stage 4j — Resource-Manager view. Every metric is filtered to
// resources whose responsibleRole === currentUser.role. Bookings and
// faults are scoped client-side using the set of resourceIds the user
// owns. Stores Officer additionally sees supply-request handling.

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
  getSupplyRequestTimestamp,
  bookingsOverTime,
  faultsBySeverityOverTime,
  conditionDistribution,
  lifecycleDistribution,
  avgResolutionDays,
  formatNumber,
  formatDaysOrHours
} from "../services/chartData";
import { exportToCsv } from "../exportCsv";
import InsightsPanel from "../insights/InsightsPanel";
import { insightsExportSection } from "../insights/insightRules";
import { categoriesForRole } from "@/app/lib/categoryResponsibility";

const db = getFirestore(app);

const SEVERITY_COLORS = {
  critical: "#ef4444",
  major:    "#f97316",
  minor:    "#f59e0b",
  cosmetic: "#facc15"
};

export default function AnalyticsResourceManager({ currentUser, navigate }) {

  const role = currentUser?.role;
  const myCategories = useMemo(() => categoriesForRole(role), [role]);

  const [period, setPeriod] = useState(() => computePresetRange("30"));

  const [bookings, setBookings] = useState([]);
  const [faults,   setFaults]   = useState([]);
  const [resources, setResources] = useState([]);
  const [supplyRequests, setSupplyRequests] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!role) return;
    const unsubs = [];
    const guard = (setter) => (snap) => setter(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
    const onErr = (e) => setError(e.message || "Failed to load analytics");

    // Bookings + faults are gated by rules to docs whose visibility
    // includes our role. A bare collection listener would fail, so we
    // scope each subscription with an `array-contains` predicate that
    // matches the rules' canSeeBooking() / canSeeFault().
    unsubs.push(onSnapshot(
      query(collection(db, "bookings"), where("visibleToRoles", "array-contains", role)),
      guard(setBookings), onErr
    ));
    unsubs.push(onSnapshot(
      query(collection(db, "faults"), where("routedToRoles", "array-contains", role)),
      guard(setFaults), onErr
    ));

    // Any approved user can read the resources collection — no scoping
    // needed; we filter by responsibleRole client-side.
    unsubs.push(onSnapshot(collection(db, "resources"), guard(setResources), onErr));

    // Stores Officer additionally subscribes to supplyRequests routed
    // to them. canSeeSupplyRequest also covers maintenance staff, but
    // an RM here is just the Stores Officer.
    if (role === "Stores/Inventory Officer") {
      unsubs.push(onSnapshot(
        query(collection(db, "supplyRequests"), where("routedToRoles", "array-contains", role)),
        guard(setSupplyRequests), onErr
      ));
    }

    return () => unsubs.forEach((u) => u());
  }, [role]);

  // Scope resources to my responsibility area. Then derive the set of
  // resourceIds we own — used to scope bookings + faults below.
  const myResources = useMemo(
    () => resources.filter((r) => r.responsibleRole === role),
    [resources, role]
  );

  const myResourceIds = useMemo(
    () => new Set(myResources.map((r) => r.assetCode || r.id)),
    [myResources]
  );

  const myBookings = useMemo(
    () => bookings.filter((b) => myResourceIds.has(b.resourceId)),
    [bookings, myResourceIds]
  );

  const myFaults = useMemo(
    () => faults.filter((f) => myResourceIds.has(f.resourceId)),
    [faults, myResourceIds]
  );

  const myHandledSupply = useMemo(
    () => supplyRequests.filter((r) =>
      role === "Stores/Inventory Officer"
      && Array.isArray(r.routedToRoles)
      && r.routedToRoles.includes(role)
    ),
    [supplyRequests, role]
  );

  const slices = useMemo(() => {
    if (!period) return null;
    const prior = priorPeriod(period);
    return {
      bookingsCurr: inPeriod(myBookings, getBookingTimestamp, period),
      bookingsPrev: inPeriod(myBookings, getBookingTimestamp, prior),
      faultsCurr:   inPeriod(myFaults,   getFaultReportTimestamp, period),
      faultsPrev:   inPeriod(myFaults,   getFaultReportTimestamp, prior),
      supplyCurr:   inPeriod(myHandledSupply, getSupplyRequestTimestamp, period),
      supplyPrev:   inPeriod(myHandledSupply, getSupplyRequestTimestamp, priorPeriod(period))
    };
  }, [period, myBookings, myFaults, myHandledSupply]);

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

  const { bookingsCurr, bookingsPrev, faultsCurr, faultsPrev, supplyCurr, supplyPrev } = slices;

  // Stage 4q — pass the full (period-filtered) RM slice into the rule
  // engine. `resources` is the unfiltered collection so rules that
  // need the responsibility partitioning can do it themselves; my-
  // scoped rules use that to derive the RM's slice.
  const insightData = {
    bookings:       bookingsCurr,
    faults:         faultsCurr,
    supplyRequests: supplyCurr,
    resources
  };

  // -----------------------------------------------------------------
  // KPIs
  // -----------------------------------------------------------------
  const totalResources = myResources.length;
  const lifecycleData = lifecycleDistribution(myResources);
  const activeCount = myResources.filter((r) => (r.lifecycleStatus || "active") === "active").length;

  const resolvedCurr = faultsCurr.filter((f) => f.status === "resolved");
  const resolvedPrev = faultsPrev.filter((f) => f.status === "resolved");
  const avgResCurr = avgResolutionDays(resolvedCurr);
  const avgResPrev = avgResolutionDays(resolvedPrev);

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
  const { series: bookingsTimeline } = bookingsOverTime(bookingsCurr, period);
  const { series: faultsSeverity }   = faultsBySeverityOverTime(faultsCurr, period);
  const conditionData = conditionDistribution(myResources);

  // -----------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------
  const buildSections = () => {
    const sections = [
      insightsExportSection(insightData, period, currentUser),
      {
        title: "My responsibility KPIs",
        columns: ["Metric", "Current", "Prior"],
        rows: [
          ["My resources (active / total)", `${activeCount} / ${totalResources}`, "—"],
          ["Bookings on my resources",      formatNumber(bookingsCurr.length), formatNumber(bookingsPrev.length)],
          ["Faults on my resources",        formatNumber(faultsCurr.length),   formatNumber(faultsPrev.length)],
          ["Avg fault resolution time",     formatDaysOrHours(avgResCurr),     formatDaysOrHours(avgResPrev)]
        ]
      },
      {
        title:   "Bookings on my resources over time",
        columns: ["Bucket", "Bookings"],
        rows:    bookingsTimeline.map((b) => [b.label, b.bookings])
      },
      {
        title:   "Faults by severity over time",
        columns: ["Bucket", "Critical", "Major", "Minor", "Cosmetic"],
        rows:    faultsSeverity.map((b) => [b.label, b.critical, b.major, b.minor, b.cosmetic])
      },
      {
        title:   "Condition distribution",
        columns: ["Condition", "Count"],
        rows:    conditionData.map((c) => [c.name, c.value])
      }
    ];

    if (role === "Stores/Inventory Officer") {
      sections.push({
        title:   "Supply requests handled",
        columns: ["Metric", "Current", "Prior"],
        rows: [
          ["Total handled",  formatNumber(supplyCurr.length), formatNumber(supplyPrev.length)],
          ["Fulfilled",      formatNumber(supplyCurr.filter((r) => r.status === "fulfilled").length),
                             formatNumber(supplyPrev.filter((r) => r.status === "fulfilled").length)]
        ]
      });
    }

    return sections;
  };

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
          <h2 className="analytics-title">My Analytics</h2>
          <p className="analytics-subtitle">
            My categories:&nbsp;
            <strong>{myCategories.length ? myCategories.join(", ") : "—"}</strong>
          </p>
        </div>
        <div className="analytics-export-row">
          <button type="button" className="analytics-export-btn" onClick={handleExportCsv}>
            Export CSV
          </button>
          {/* PDF export is admin-only per spec. */}
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
          label="My resources"
          value={formatNumber(totalResources)}
          sublabel={`${activeCount} active`}
        />
        <KpiCard
          label="Bookings on my resources"
          value={formatNumber(bookingsCurr.length)}
          delta={deltaFor(bookingsCurr.length, bookingsPrev.length, "up")}
        />
        <KpiCard
          label="Faults on my resources"
          value={formatNumber(faultsCurr.length)}
          sublabel={`avg ${formatDaysOrHours(avgResCurr)} to resolve`}
          delta={deltaFor(faultsCurr.length, faultsPrev.length, "down")}
        />
        {role === "Stores/Inventory Officer" && (
          <KpiCard
            label="Supply requests handled"
            value={formatNumber(supplyCurr.length)}
            delta={deltaFor(supplyCurr.length, supplyPrev.length, "up")}
          />
        )}
      </div>

      <div className="analytics-grid">

        <div className="analytics-chart-card analytics-chart-wide">
          <h3 className="analytics-chart-title">Bookings on my resources over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={bookingsTimeline} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
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
          <h3 className="analytics-chart-title">Faults by severity</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={faultsSeverity} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
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
          <h3 className="analytics-chart-title">Condition distribution</h3>
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

      </div>

    </div>
  );

}
