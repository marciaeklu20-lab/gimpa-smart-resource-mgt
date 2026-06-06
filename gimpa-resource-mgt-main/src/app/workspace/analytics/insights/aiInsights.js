"use client";

// Stage 4q.2 — client wrapper around the generateInsights callable.
// Adds:
//   - localStorage cache, 1h TTL, keyed by (uid, periodKey)
//   - Force-refresh bypass for the Refresh button
//   - Error normalization so the UI can render code-aware messages

import { getFunctions, httpsCallable } from "firebase/functions";

import app from "@/firebase/config";

import {
  buildAiSummary,
  isSummaryWorthSending
} from "./buildAiSummary";
import { formatRangeISO } from "../services/dateUtils";

const TTL_MS = 60 * 60 * 1000;
const CACHE_PREFIX = "gimpa-ai-insights:";
const REGION = "europe-west1";

// ---------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------

const buildPeriodKey = (period) => {
  if (!period) return "no-period";
  const id = period.id || "custom";
  return `${id}|${formatRangeISO(period.startDate)}|${formatRangeISO(period.endDate)}`;
};

const buildCacheKey = (uid, period) => {
  return `${CACHE_PREFIX}${uid || "anon"}:${buildPeriodKey(period)}`;
};

const safeStorage = () => {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

const readCache = (key) => {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (key, value) => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ ...value, ts: Date.now() }));
  } catch {
    /* quota / serialization — silent */
  }
};

const removeCache = (key) => {
  const storage = safeStorage();
  if (!storage) return;
  try { storage.removeItem(key); } catch { /* silent */ }
};

// ---------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------

const normalizeError = (err) => {
  // Firebase callable errors carry a `.code` like "functions/internal".
  // We strip the prefix and map to a small UI-friendly vocabulary.
  const raw = err?.code || err?.message || "unknown";
  let code = "internal";
  if (typeof raw === "string") {
    if (raw.includes("unauthenticated")) code = "unauthenticated";
    else if (raw.includes("invalid-argument")) code = "invalid-input";
    else if (raw.includes("resource-exhausted") || raw.includes("rate")) code = "rate-limited";
  }
  return { code, message: err?.message || String(err) };
};

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export async function generateAiInsights({ uid, data, role, period, force = false }) {
  const cacheKey = buildCacheKey(uid, period);

  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) {
      return {
        insights:    cached.insights,
        generatedAt: cached.generatedAt,
        fromCache:   true
      };
    }
  } else {
    removeCache(cacheKey);
  }

  const summary = buildAiSummary(data || {}, period);
  if (!isSummaryWorthSending(summary)) {
    // Empty period — short-circuit. We persist an empty result so the
    // UI doesn't keep re-asking the function when there's nothing to
    // analyze.
    const empty = {
      insights:    [],
      generatedAt: new Date().toISOString(),
      fromCache:   false
    };
    writeCache(cacheKey, empty);
    return empty;
  }

  let payload;
  try {
    const functions = getFunctions(app, REGION);
    const fn = httpsCallable(functions, "generateInsights");
    const result = await fn({
      summary,
      role:        role || "operator",
      periodLabel: period?.label || ""
    });
    payload = result?.data || {};
  } catch (err) {
    const norm = normalizeError(err);
    const wrapped = new Error(norm.message);
    wrapped.code = norm.code;
    throw wrapped;
  }

  const out = {
    insights:    Array.isArray(payload.insights) ? payload.insights : [],
    generatedAt: payload.generatedAt || new Date().toISOString(),
    fromCache:   false
  };
  writeCache(cacheKey, out);
  return out;
}

export function clearAiInsightsCache({ uid, period }) {
  removeCache(buildCacheKey(uid, period));
}

export function clearAllAiInsightsCache() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch { /* silent */ }
}
