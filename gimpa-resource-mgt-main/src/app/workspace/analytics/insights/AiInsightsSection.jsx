"use client";

// Stage 4q.2 — AI-generated narrative insights section. Renders below
// the rule-based cards inside InsightsPanel. Pulls from a Cloud
// Function (Gemini) via aiInsights.js with a 1h localStorage cache.
//
// Failure mode: if the Function errors out, we keep the existing
// rule-based cards untouched and surface a single line of explanation
// in this section. The rule cards remain the always-on floor.

import { useCallback, useEffect, useRef, useState } from "react";

import InsightCard from "./InsightCard";
import { generateAiInsights } from "./aiInsights";

const timeAgo = (iso) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(iso).toLocaleString("en-GB", {
    day:   "2-digit",
    month: "short",
    hour:  "2-digit",
    minute:"2-digit"
  });
};

export default function AiInsightsSection({ data, period, currentUser }) {

  const uid = currentUser?.uid || null;
  const role = currentUser?.role || "operator";

  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  // Stable inflight tracker — guards against race where the user
  // changes period mid-call. Refs avoid re-triggering effects.
  const reqIdRef = useRef(0);

  const runGeneration = useCallback(async (force) => {
    if (!uid) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await generateAiInsights({ uid, data, role, period, force });
      if (reqId !== reqIdRef.current) return;  // stale — newer call in flight
      setInsights(result.insights || []);
      setGeneratedAt(result.generatedAt || null);
      setFromCache(!!result.fromCache);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      const code = err?.code || "internal";
      const msg = code === "unauthenticated"
        ? "Please sign in again to load AI suggestions."
        : code === "rate-limited"
          ? "Too many requests right now — try again in a minute."
          : "AI suggestions are unavailable right now.";
      setError(msg);
      setInsights([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [uid, data, role, period]);

  useEffect(() => {
    // Cache-first read on mount + every period change.
    runGeneration(false);
  }, [runGeneration]);

  if (!uid) return null;

  const onRefresh = () => runGeneration(true);

  return (
    <section className="ai-insights-section">

      <div className="ai-insights-header">
        <h3>✨ AI analysis</h3>
        <div className="ai-insights-meta">
          {generatedAt && !loading && (
            <span className="ai-insights-timestamp">
              {fromCache ? "Cached " : "Generated "}{timeAgo(generatedAt)}
            </span>
          )}
          <button
            type="button"
            className="ai-insights-refresh"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh AI insights"
          >
            {loading ? "Analyzing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="ai-insights-fallback">
          {error} The pattern-detected insights above remain accurate.
        </div>
      )}

      {!error && loading && insights.length === 0 && (
        <div className="ai-insights-loading">Analyzing the period…</div>
      )}

      {!error && !loading && insights.length === 0 && (
        <div className="ai-insights-empty">
          No additional suggestions for this period.
        </div>
      )}

      {insights.length > 0 && (
        <>
          <div className="ai-insights-grid">
            {insights.map((ins) => (
              <InsightCard
                key={ins.id}
                insight={{ ...ins, source: "ai" }}
                onClick={() => {}}
              />
            ))}
          </div>
          <p className="ai-insights-disclaimer">
            AI-generated suggestions powered by Google Gemini. Verify
            specifics before acting.
          </p>
        </>
      )}

    </section>
  );

}
