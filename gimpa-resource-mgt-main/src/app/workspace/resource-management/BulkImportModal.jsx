"use client";

// Stage 4i: three-step wizard for CSV-driven bulk resource import.
//   Step 1 (upload):   drop zone + file picker + template download
//   Step 2 (preview):  validation table + summary + import button
//   Step 3 (results):  success count + failures + error-log download
//
// Lives behind a "Bulk Import" button in CampusResourceControls. The
// gating (who sees the button) is upstream; once the modal is open we
// still re-check currentUserRole inside parseResourceCsv to filter
// rows the operator isn't allowed to import.

import { useEffect, useMemo, useState } from "react";
import { IoCloseOutline } from "react-icons/io5";

import {
  parseResourceCsv,
  buildTemplateCsv
} from "./services/parseResourceCsv";

import { bulkImportResources } from "./services/bulkImportResources";

import "@/app/styles/resource-management/bulk-import.css";

const STEP_UPLOAD  = 1;
const STEP_PREVIEW = 2;
const STEP_RESULTS = 3;

// ---------------------------------------------------------------------
// downloadString — generic blob-download helper.
// ---------------------------------------------------------------------
const downloadString = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------
// formatRowErrors — collapse a row's errors[] into a one-line summary
// for the preview table.
// ---------------------------------------------------------------------
const formatRowErrors = (errors) =>
  errors.map((e) => `${e.field}: ${e.message}`).join(" • ");

const formatRowWarnings = (warnings) =>
  warnings.map((w) => `${w.field}: ${w.message}`).join(" • ");

// ---------------------------------------------------------------------
// BulkImportModal
// ---------------------------------------------------------------------

export default function BulkImportModal({
  currentUser,
  onClose,
  onImported
}) {

  const [step, setStep] = useState(STEP_UPLOAD);

  // Step 1 state.
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  // Step 2 state.
  const [parseResult, setParseResult] = useState(null);  // { rows, errors, warnings }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Step 3 state.
  const [results, setResults] = useState(null); // { successCount, failures, status }

  const role = currentUser?.role || null;

  // -----------------------------------------------------------------
  // Body-scroll lock while the modal is open. Without this, scrolling
  // inside the wizard bleeds through to the resource list behind it
  // when the cursor leaves the modal frame.
  // -----------------------------------------------------------------
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  // -----------------------------------------------------------------
  // Step 1 handlers.
  // -----------------------------------------------------------------

  const handleFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      alert("Please select a .csv file.");
      return;
    }
    setFile(f);
  };

  const handleDownloadTemplate = () => {
    const csv = buildTemplateCsv();
    downloadString(csv, "resource-import-template.csv", "text/csv");
  };

  const handleContinueToPreview = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const result = await parseResourceCsv(file, role);
      setParseResult(result);
      setStep(STEP_PREVIEW);
    } catch (err) {
      alert(`Failed to parse CSV: ${err.message || String(err)}`);
    } finally {
      setParsing(false);
    }
  };

  // -----------------------------------------------------------------
  // Step 2 — derived counts + import.
  // -----------------------------------------------------------------

  const counts = useMemo(() => {
    if (!parseResult) return { valid: 0, invalid: 0, warnings: 0, total: 0 };
    let valid = 0, invalid = 0, warnings = 0;
    for (const row of parseResult.rows) {
      if (row.errors.length > 0) invalid++;
      else valid++;
      if (row.warnings.length > 0) warnings++;
    }
    return {
      valid,
      invalid,
      warnings,
      total: parseResult.rows.length
    };
  }, [parseResult]);

  const handleImport = async () => {
    if (!parseResult) return;

    const importable = parseResult.rows.filter(
      (r) => r.errors.length === 0
    );

    if (importable.length === 0) return;

    setImporting(true);
    setProgress({ done: 0, total: importable.length });

    try {
      const out = await bulkImportResources({
        normalizedRows: importable,
        currentUser,
        csvFilename:    file?.name || "unknown.csv",
        onProgress:     setProgress
      });
      setResults(out);
      setStep(STEP_RESULTS);
      if (typeof onImported === "function") onImported();
    } catch (err) {
      alert(`Import failed: ${err.message || String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  // -----------------------------------------------------------------
  // Step 3 — error log download + close.
  // -----------------------------------------------------------------

  const handleDownloadErrorLog = () => {
    if (!results) return;
    const header = "row,assetCode,reason\n";
    const lines = results.failures.map(
      (f) => `${f.rawIndex},${JSON.stringify(f.assetCode || "")},${JSON.stringify(f.reason)}`
    );
    downloadString(
      header + lines.join("\n"),
      "import-errors.csv",
      "text/csv"
    );
  };

  // -----------------------------------------------------------------
  // Render.
  // -----------------------------------------------------------------

  return (
    <div className="bulk-import-overlay" role="dialog" aria-modal="true">

      <div className="bulk-import-modal">

        <div className="bulk-import-header">
          <div className="bulk-import-title-block">
            <h2>Bulk Import Resources</h2>
            <p className="bulk-import-step-indicator">
              Step {step} of 3 — {
                step === STEP_UPLOAD ? "Upload"
                : step === STEP_PREVIEW ? "Preview"
                : "Results"
              }
            </p>
          </div>
          <button
            type="button"
            className="bulk-import-close-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <IoCloseOutline size={28} />
          </button>
        </div>

        {/* Step 1 — Upload --------------------------------------- */}
        {step === STEP_UPLOAD && (
          <div className="bulk-import-body">

            <div className="bulk-import-template-row">
              <p>Need a starting point?</p>
              <button
                type="button"
                className="bulk-import-template-btn"
                onClick={handleDownloadTemplate}
              >
                Download template
              </button>
            </div>

            <div
              className={`bulk-import-dropzone ${dragOver ? "drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="bulk-import-dropzone-inner">
                <p className="bulk-import-dropzone-title">
                  {file ? file.name : "Drop your CSV here"}
                </p>
                <p className="bulk-import-dropzone-sub">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB · ready to preview`
                    : "or click below to pick a file"}
                </p>
                <label className="bulk-import-file-picker">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  Choose CSV file
                </label>
              </div>
            </div>

            <div className="bulk-import-actions">
              <button
                type="button"
                className="bulk-import-cancel-btn"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bulk-import-primary-btn"
                disabled={!file || parsing}
                onClick={handleContinueToPreview}
              >
                {parsing ? "Parsing..." : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Preview -------------------------------------- */}
        {step === STEP_PREVIEW && parseResult && (
          <div className="bulk-import-body">

            {parseResult.errors.length > 0 && (
              <div className="bulk-import-csv-errors">
                <strong>CSV errors:</strong>
                <ul>
                  {parseResult.errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {parseResult.warnings.length > 0 && (
              <div className="bulk-import-csv-warnings">
                <strong>Warnings:</strong>
                <ul>
                  {parseResult.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bulk-import-summary">
              <span className="bulk-import-summary-stat bulk-import-summary-valid">
                {counts.valid} valid
              </span>
              <span className="bulk-import-summary-stat bulk-import-summary-invalid">
                {counts.invalid} {counts.invalid === 1 ? "error" : "errors"}
              </span>
              <span className="bulk-import-summary-stat bulk-import-summary-warnings">
                {counts.warnings} {counts.warnings === 1 ? "warning" : "warnings"}
              </span>
              <span className="bulk-import-summary-total">
                of {counts.total} total
              </span>
            </div>

            <div className="bulk-import-table-wrap">
              <table className="bulk-import-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Asset code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((row) => {
                    const hasErr  = row.errors.length > 0;
                    const hasWarn = row.warnings.length > 0;
                    const raw     = row.normalized || {};
                    return (
                      <tr
                        key={row.rawIndex}
                        className={hasErr ? "row-error" : hasWarn ? "row-warning" : ""}
                      >
                        <td>{row.rawIndex}</td>
                        <td>{raw.assetCode || "—"}</td>
                        <td>{raw.resourceName || "—"}</td>
                        <td>{raw.category || "—"}</td>
                        <td>
                          {hasErr ? (
                            <span className="bulk-import-status-pill status-error">
                              error
                            </span>
                          ) : hasWarn ? (
                            <span className="bulk-import-status-pill status-warning">
                              warning
                            </span>
                          ) : (
                            <span className="bulk-import-status-pill status-ok">
                              ok
                            </span>
                          )}
                        </td>
                        <td className="bulk-import-detail-cell">
                          {hasErr
                            ? formatRowErrors(row.errors)
                            : hasWarn
                            ? formatRowWarnings(row.warnings)
                            : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {importing && (
              <div className="bulk-import-progress">
                Importing {progress.done} / {progress.total}...
              </div>
            )}

            <div className="bulk-import-actions">
              <button
                type="button"
                className="bulk-import-cancel-btn"
                disabled={importing}
                onClick={() => {
                  setStep(STEP_UPLOAD);
                  setParseResult(null);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="bulk-import-primary-btn"
                disabled={counts.valid === 0 || importing}
                onClick={handleImport}
              >
                {importing
                  ? "Importing..."
                  : `Import ${counts.valid} valid ${counts.valid === 1 ? "row" : "rows"}`}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Results -------------------------------------- */}
        {step === STEP_RESULTS && results && (
          <div className="bulk-import-body">

            <div className={`bulk-import-result-banner status-${results.status}`}>
              {results.status === "complete" && (
                <>
                  <strong>All done.</strong> Successfully imported{" "}
                  {results.successCount}{" "}
                  {results.successCount === 1 ? "resource" : "resources"}.
                </>
              )}
              {results.status === "partial" && (
                <>
                  <strong>Partial import.</strong> {results.successCount}{" "}
                  succeeded, {results.failures.length} failed.
                </>
              )}
              {results.status === "failed" && (
                <>
                  <strong>Import failed.</strong> No resources were written.{" "}
                  {results.failures.length} {results.failures.length === 1 ? "row" : "rows"} reported errors.
                </>
              )}
            </div>

            {results.failures.length > 0 && (
              <>
                <div className="bulk-import-failures-header">
                  <span>Failed rows ({results.failures.length})</span>
                  <button
                    type="button"
                    className="bulk-import-template-btn"
                    onClick={handleDownloadErrorLog}
                  >
                    Download error log
                  </button>
                </div>

                <div className="bulk-import-table-wrap">
                  <table className="bulk-import-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Asset code</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.failures.map((f, i) => (
                        <tr key={i} className="row-error">
                          <td>{f.rawIndex}</td>
                          <td>{f.assetCode || "—"}</td>
                          <td className="bulk-import-detail-cell">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="bulk-import-actions">
              <button
                type="button"
                className="bulk-import-primary-btn"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
