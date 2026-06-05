"use client";

// Stage 4j — KPI card with comparative delta. Replaces the simpler
// inline KpiCard in the old Analytics.jsx. `delta` is { value (pct or
// null), direction, isGoodWhen } so the card knows whether "up" is
// good (bookings, resolutions) or bad (faults received).

export default function KpiCard({ label, value, sublabel, delta, tone }) {

  const renderDelta = () => {
    if (!delta) return null;
    const { direction, deltaPct, isGoodWhen } = delta;

    let goodness = "neutral";
    if (direction === "up") {
      goodness = isGoodWhen === "down" ? "bad" : "good";
    } else if (direction === "down") {
      goodness = isGoodWhen === "down" ? "good" : "bad";
    }

    const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
    const pctText = deltaPct == null
      ? "no prior data"
      : `${Math.abs(deltaPct).toFixed(0)}%`;

    return (
      <div className={`analytics-kpi-delta tone-${goodness}`}>
        <span className="analytics-kpi-delta-arrow">{arrow}</span>
        <span className="analytics-kpi-delta-value">{pctText}</span>
        <span className="analytics-kpi-delta-suffix">vs prior period</span>
      </div>
    );
  };

  return (
    <div className={`analytics-kpi-card ${tone ? `tone-${tone}` : ""}`}>
      <div className="analytics-kpi-value">{value}</div>
      <div className="analytics-kpi-label">{label}</div>
      {sublabel && <div className="analytics-kpi-sublabel">{sublabel}</div>}
      {renderDelta()}
    </div>
  );

}
