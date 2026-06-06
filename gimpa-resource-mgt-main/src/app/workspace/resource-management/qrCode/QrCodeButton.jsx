"use client";

// Stage 4k — small header trigger that opens the QR modal for a
// resource. The modal (and the qrcode.react bundle it pulls in) is
// lazy-loaded so the AssetDetailPanel chunk stays lean for viewers who
// never open it — same pattern as the Transfer / Report-Fault modals.

import { useState } from "react";

import dynamic from "next/dynamic";

import { MdQrCode2 } from "react-icons/md";

import "@/app/styles/qr-code/QrCode.css";

const QrCodeModal = dynamic(() => import("./QrCodeModal"), { ssr: false });

export default function QrCodeButton({ resource }) {

  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="qr-code-btn"
        title="Show QR code"
        aria-label="Show QR code"
        onClick={() => setOpen(true)}
      >
        <MdQrCode2 size={16} />
        QR Code
      </button>

      {open && (
        <QrCodeModal resource={resource} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
