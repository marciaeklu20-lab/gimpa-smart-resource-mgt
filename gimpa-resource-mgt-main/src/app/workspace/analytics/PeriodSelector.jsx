"use client";

// Stage 4j — period selector. Drops on top of every reporting view.
// State lives in the parent; this component is presentational + a few
// internal handlers for the Custom-range flow.

import { useEffect, useState } from "react";

import {
  PERIOD_PRESETS,
  computePresetRange,
  buildCustomRange,
  formatRangeISO
} from "./services/dateUtils";

export default function PeriodSelector({ value, onChange }) {

  const activeId = value?.id || "30";
  const isCustom = activeId === "custom";

  // Local-only state for the date inputs. We don't push to the parent
  // until both From and To are valid so the charts don't thrash while
  // the user types.
  const [from, setFrom] = useState(
    isCustom ? formatRangeISO(value.startDate) : ""
  );
  const [to, setTo] = useState(
    isCustom ? formatRangeISO(value.endDate) : ""
  );
  const [customError, setCustomError] = useState(null);

  // Initialize from/to when the parent flips to Custom from elsewhere
  // (e.g., default load with a custom range from URL — not used today
  // but cheap to support).
  useEffect(() => {
    if (isCustom && value) {
      setFrom(formatRangeISO(value.startDate));
      setTo(formatRangeISO(value.endDate));
    }
  }, [isCustom, value]);

  const handlePresetClick = (id) => {
    const range = computePresetRange(id);
    if (range) onChange(range);
  };

  const handleCustomClick = () => {
    // First time switching to custom: default to the current range so
    // the user has reasonable values to tweak rather than blank inputs.
    if (value && !isCustom) {
      setFrom(formatRangeISO(value.startDate));
      setTo(formatRangeISO(value.endDate));
    }
    const range = buildCustomRange(
      from || formatRangeISO(value.startDate),
      to   || formatRangeISO(value.endDate)
    );
    if (range) onChange(range);
  };

  const handleApplyCustom = () => {
    const range = buildCustomRange(from, to);
    if (!range) {
      setCustomError("Please pick a valid From / To range.");
      return;
    }
    setCustomError(null);
    onChange(range);
  };

  return (
    <div className="period-selector">

      <div className="period-selector-presets" role="tablist">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activeId === p.id}
            className={`period-selector-chip ${activeId === p.id ? "active" : ""}`}
            onClick={() => handlePresetClick(p.id)}
          >
            {p.label}
          </button>
        ))}

        <button
          type="button"
          role="tab"
          aria-selected={isCustom}
          className={`period-selector-chip ${isCustom ? "active" : ""}`}
          onClick={handleCustomClick}
        >
          Custom
        </button>
      </div>

      {isCustom && (
        <div className="period-selector-custom-row">
          <label>
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="period-selector-apply"
            onClick={handleApplyCustom}
          >
            Apply
          </button>
          {customError && (
            <span className="period-selector-error">{customError}</span>
          )}
        </div>
      )}

    </div>
  );

}
