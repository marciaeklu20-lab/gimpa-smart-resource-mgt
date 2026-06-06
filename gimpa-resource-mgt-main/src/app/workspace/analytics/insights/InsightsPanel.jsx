"use client";

// Stage 4q — top-of-page panel that runs the rule registry against
// the data the role view already has subscribed. Pure derivation, no
// new Firestore calls. Result-set is capped at 6 cards (sorted by
// severity then sortWeight) inside computeInsights.
//
// Stage 4q.1: insight.target is now a navigate-shaped object (matches
// workspace/page.jsx's navigate() keys: sidebar/tab/assetId/faultId/
// filter). The panel forwards it verbatim to navigate() — no dispatch
// shim between the rule and the route.

import { useMemo } from "react";

import { computeInsights } from "./insightRules";
import InsightCard from "./InsightCard";
import AiInsightsSection from "./AiInsightsSection";

export default function InsightsPanel({ data, period, currentUser, navigate }) {

  const insights = useMemo(
    () => computeInsights(data, period, currentUser),
    [data, period, currentUser]
  );

  const handleCardClick = (insight) => {
    if (!insight?.target) return;
    if (typeof navigate === "function") navigate(insight.target);
  };

  return (
    <section className="insights-panel" aria-label="Pattern detection">

      <div className="insights-panel-header">
        <h3 className="insights-panel-title">
          <span className="insights-panel-glyph" aria-hidden="true">💡</span>
          Insights{period?.label ? ` · ${period.label}` : ""}
        </h3>
        <span className="insights-panel-meta">
          Pattern detection · {insights.length} {insights.length === 1 ? "finding" : "findings"}
        </span>
      </div>

      {insights.length === 0 ? (
        <div className="insights-panel-empty">
          No notable patterns this period — system operating within normal ranges.
        </div>
      ) : (
        <div className="insights-panel-grid">
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* Stage 4q.2 — AI narrative section sits beneath the
          rule-based cards. Gracefully no-ops for users without a uid. */}
      <AiInsightsSection
        data={data}
        period={period}
        currentUser={currentUser}
        navigate={navigate}
      />

    </section>
  );

}
