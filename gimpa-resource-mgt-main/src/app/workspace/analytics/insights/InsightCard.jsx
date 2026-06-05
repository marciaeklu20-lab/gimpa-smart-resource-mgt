"use client";

// Stage 4q — single insight card.
//
// Stage 4q.1: The entire card is the click target when the insight has
// a navigation target. Observational insights (no target — e.g.,
// heavyUser, slowResolution, supplyRequestVolume) render as a static
// <div> with no hover lift so it's visually clear nothing happens on
// click.
//
// Severity drives the left-border color (info=blue, warning=amber,
// action=red) and the badge accent. Category drives a small emoji
// glyph.

const SEVERITY_LABEL = {
  action:  "Action",
  warning: "Watch",
  info:    "Info"
};

const CATEGORY_GLYPH = {
  usage:       "📅",
  maintenance: "🔧",
  supply:      "📦",
  lifecycle:   "⚠️"
};

export default function InsightCard({ insight, onClick }) {

  const { severity, category, title, description, metric, target } = insight;
  const glyph = CATEGORY_GLYPH[category] || "•";
  const hasTarget = !!target;

  const body = (
    <>
      <div className="insight-card-head">
        <span className="insight-card-glyph" aria-hidden="true">{glyph}</span>
        <span className={`insight-card-sev-badge insight-card-sev-${severity}`}>
          {SEVERITY_LABEL[severity] || severity}
        </span>
      </div>

      <div className="insight-card-title">{title}</div>
      <div className="insight-card-description">{description}</div>

      <div className="insight-card-footer">
        {metric && (
          <span className="insight-card-metric">{metric.delta}</span>
        )}
        {hasTarget && (
          <span className="insight-card-arrow" aria-hidden="true">→</span>
        )}
      </div>
    </>
  );

  if (!hasTarget) {
    return (
      <div className={`insight-card insight-card-${severity} insight-card-observational`}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`insight-card insight-card-${severity}`}
      onClick={() => onClick?.(insight)}
      aria-label={`Open insight: ${title}`}
    >
      {body}
    </button>
  );

}
