"use client";

// Stage 4k — public scan-landing page. The dynamic [assetCode] segment
// is read via useParams() (rather than the params prop) so this stays a
// plain client component without unwrapping the Next 16 params promise.
// All the fetch + render logic lives in PublicResourceView.

import { useParams } from "next/navigation";

import PublicResourceView from "./PublicResourceView";

export default function PublicResourcePage() {

  const params = useParams();
  const raw = Array.isArray(params?.assetCode)
    ? params.assetCode[0]
    : params?.assetCode;
  const assetCode = raw ? decodeURIComponent(raw) : "";

  return <PublicResourceView assetCode={assetCode} />;
}
