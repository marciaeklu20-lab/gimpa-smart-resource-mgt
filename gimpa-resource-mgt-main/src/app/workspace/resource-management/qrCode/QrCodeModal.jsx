"use client";

// Stage 4k — QR code modal. Shows a high-quality QR encoding the public
// scan URL (origin + /r/<assetCode>), plus Download PNG / Print actions.
//
// Two QR renderers from qrcode.react are used deliberately:
//   - <QRCodeSVG> for the on-screen display (crisp at any DPI)
//   - <QRCodeCanvas> rendered off-screen at high resolution as the
//     source for PNG export and the print window (canvas.toDataURL).
// Generating on the fly each time — nothing is stored (see Stage 4k
// scope guards). Pure client generation, no Cloud Function.

import { useRef } from "react";

import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";

import "@/app/styles/qr-code/QrCode.css";

// Escapes a value for safe interpolation into the print window's HTML.
const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export default function QrCodeModal({ resource, onClose }) {

  const canvasRef = useRef(null);

  const assetCode = resource?.assetCode || resource?.id || "";
  const resourceName = resource?.resourceName || assetCode;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/r/${assetCode}`;

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `qr-${assetCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");

    const win = window.open("", "_blank", "width=480,height=640");
    if (!win) return; // pop-up blocked — nothing else we can do here.

    // The image's onload triggers print so we never print a blank page
    // before the data URL has painted.
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QR — ${escapeHtml(assetCode)}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        text-align: center;
        padding: 48px 24px;
        margin: 0;
      }
      .qr-print-name { font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #1f2937; }
      .qr-print-img { width: 320px; height: 320px; }
      .qr-print-code { font-family: monospace; font-size: 16px; margin-top: 16px; color: #374151; }
    </style>
  </head>
  <body onload="window.focus(); window.print();">
    <div class="qr-print-name">${escapeHtml(resourceName)}</div>
    <img class="qr-print-img" src="${dataUrl}" alt="QR code for ${escapeHtml(assetCode)}" />
    <div class="qr-print-code">${escapeHtml(assetCode)}</div>
  </body>
</html>`);
    win.document.close();
  };

  return (
    <div className="qr-modal-overlay" onClick={onClose}>
      <div
        className="qr-modal"
        role="dialog"
        aria-label="Resource QR code"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="qr-modal-close"
          aria-label="Close QR code"
          onClick={onClose}
        >
          ×
        </button>

        <h3 className="qr-modal-title">{resourceName}</h3>

        <div className="qr-modal-svg-wrap">
          <QRCodeSVG value={url} size={300} level="H" marginSize={2} />
        </div>

        <div className="qr-modal-url">{url}</div>

        <div className="qr-modal-buttons">
          <button
            type="button"
            className="qr-modal-btn"
            onClick={handlePrint}
          >
            Print
          </button>
          <button
            type="button"
            className="qr-modal-btn qr-modal-btn-primary"
            onClick={handleDownload}
          >
            Download PNG
          </button>
        </div>

        {/* Off-screen high-resolution canvas — the PNG/print source. */}
        <div className="qr-modal-canvas-offscreen" aria-hidden="true">
          <QRCodeCanvas
            ref={canvasRef}
            value={url}
            size={1024}
            level="H"
            marginSize={2}
          />
        </div>
      </div>
    </div>
  );
}
