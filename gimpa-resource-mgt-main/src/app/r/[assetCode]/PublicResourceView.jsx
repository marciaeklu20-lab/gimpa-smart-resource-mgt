"use client";

// Stage 4k — the public resource view rendered after a QR scan.
//
// Fetches resources/{assetCode} directly (the Firestore read rule for
// /resources is public so printed QR codes work without sign-in). Only
// a SAFE subset of fields is rendered here — name, code, type/category,
// location, capacity, condition, lifecycle status. Sensitive fields
// (custodianEmail, acquisitionCost, vendor, acquisitionDate) are
// deliberately never read into the markup. This client-side filtering
// is the field-level guard, since Firestore rules can't restrict reads
// by field; see the Future Work note in firestore.rules about moving
// sensitive fields to a private subcollection.

import { useEffect, useState } from "react";

import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { db, auth } from "@/firebase/config";

import {
  lifecycleLabel,
  conditionLabel,
  formatLocation
} from "@/app/lib/resourceMeta";

import CheckInForm from "./CheckInForm";

import "@/app/styles/qr-code/QrCode.css";

export default function PublicResourceView({ assetCode }) {

  // status: "loading" | "ready" | "notfound" | "error"
  const [status, setStatus] = useState("loading");
  const [resource, setResource] = useState(null);

  // Stage 4o Phase 2: detect auth so signed-in staff get the QR check-in
  // form below the read-only details. Anonymous scanners see nothing
  // extra. The Cloud Function re-checks approval, so this is UI-only.
  const [user, setUser] = useState(null);
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!assetCode) {
      setStatus("notfound");
      return;
    }

    let active = true;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "resources", assetCode));
        if (!active) return;
        if (!snap.exists()) {
          setStatus("notfound");
          return;
        }
        setResource({ id: snap.id, ...snap.data() });
        setStatus("ready");
      } catch (err) {
        console.error("[PublicResourceView] fetch failed:", err);
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [assetCode]);

  if (status === "loading") {
    return (
      <div className="public-resource-state">
        <p>Loading resource…</p>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="public-resource-state">
        <h1>Resource not found</h1>
        <p>
          We couldn&apos;t find a resource with code{" "}
          <strong>{assetCode || "—"}</strong>.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="public-resource-state">
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
      </div>
    );
  }

  // --- ready ---------------------------------------------------------
  const status_ = resource.lifecycleStatus || "active";
  const condition = resource.condition || "good";

  const subtitleParts = [resource.type, resource.category].filter(Boolean);
  const location = formatLocation(resource.location);
  const capacity = Number(resource.capacity);
  const showCapacity = Number.isFinite(capacity) && capacity > 0;

  return (
    <div className="public-resource-page">

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="public-resource-logo"
        src="/images/gimpa-logo.png"
        alt="GIMPA"
      />

      <h1 className="public-resource-name">
        {resource.resourceName || resource.id}
      </h1>

      <span className="public-resource-code">
        {resource.assetCode || resource.id}
      </span>

      {subtitleParts.length > 0 && (
        <div className="public-resource-subtitle">
          {subtitleParts.join(" · ")}
        </div>
      )}

      <div className="public-resource-badges">
        <span className={`public-resource-badge public-badge-${condition}`}>
          {conditionLabel(condition)}
        </span>
        <span className={`public-resource-badge public-badge-${status_}`}>
          {lifecycleLabel(status_)}
        </span>
      </div>

      <div className="public-resource-label">Location</div>
      <div className="public-resource-value">{location}</div>

      {showCapacity && (
        <>
          <div className="public-resource-label">Capacity</div>
          <div className="public-resource-value">{capacity}</div>
        </>
      )}

      <div className="public-resource-footer">
        {user
          ? <a href="/login">Manage this resource in the workspace</a>
          : <a href="/login">Sign in to book, report a fault, or check in</a>}
      </div>

      {/* Stage 4o Phase 2: QR check-in — only for signed-in users. */}
      {user && (
        <CheckInForm resource={resource} currentUser={user} />
      )}

    </div>
  );
}
