// Stage 4k — minimal layout for the public QR scan-landing route.
//
// Deliberately NOT the workspace layout: a visitor who scans a QR
// affixed to a desk or lab door should land on a clean, standalone page
// with no Sidebar / Header / admin chrome. The root layout.js still
// wraps this (html/body/ThemeProvider), so this layer only provides a
// white full-height container and route-scoped metadata.

import "@/app/styles/qr-code/QrCode.css";

export const metadata = {
  title: "GIMPA Resource",
  description: "Resource details"
};

export default function PublicResourceLayout({ children }) {
  return <div className="public-route-root">{children}</div>;
}
