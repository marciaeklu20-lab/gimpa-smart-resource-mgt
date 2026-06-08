// Stage 4o Phase 2 — one-shot backfill of resources.currentLocation.
//
// Populates currentLocation (source="home") on every resource that
// doesn't already have it, so the Live Map + Movement History have a
// baseline before any QR check-ins happen. Idempotent — re-running skips
// resources that already carry the field.
//
// Run once, with Application Default Credentials pointing at the project:
//
//   # firebase-admin must resolve — easiest is to run it with the
//   # functions/ node_modules on the path (that package has firebase-admin):
//   cd /home/user/gimpa-smart-resource-mgt
//   NODE_PATH=gimpa-resource-mgt-main/functions/node_modules \
//     node scripts/backfillCurrentLocation.js
//
// (Or `cd gimpa-resource-mgt-main/functions && node ../../scripts/backfillCurrentLocation.js`.)
//
// NOTE: the coordinate table + jitter below are DUPLICATED from
// src/app/lib/gimpaBuildingCoordinates.js. That module is ESM (export
// const ...), so a CommonJS require() of it fails — inlining keeps this
// script dependency-free and produces byte-identical home coordinates to
// what the map already renders. Keep in sync if the web table changes.

const admin = require("firebase-admin");

admin.initializeApp({ projectId: "gimpa-resource-mgt" });
const db = admin.firestore();

const GIMPA_CENTER = { lat: 5.6500, lng: -0.1933 };

const BUILDING_COORDINATES = {
  "Main Administration Block": { lat: 5.6502, lng: -0.1935 },
  "Engineering Block":         { lat: 5.6498, lng: -0.1928 },
  "Faculty of Business":       { lat: 5.6495, lng: -0.1940 },
  "Conference Centre":         { lat: 5.6508, lng: -0.1932 },
  "Library Block":             { lat: 5.6500, lng: -0.1925 },
  "Computer Centre":           { lat: 5.6505, lng: -0.1942 },
  "Halls of Residence":        { lat: 5.6493, lng: -0.1948 },
  "GIMPA SBS Building":        { lat: 5.6510, lng: -0.1925 },
  "Logistics Block":           { lat: 5.6488, lng: -0.1938 },
  "Maintenance Workshop":      { lat: 5.6488, lng: -0.1925 },
  "IT Storage":                { lat: 5.6505, lng: -0.1940 },
  "AV Storage":                { lat: 5.6502, lng: -0.1928 }
};

function buildingCoordsForResource(resource) {
  const buildingName = resource?.location?.building;
  const base = BUILDING_COORDINATES[buildingName] || GIMPA_CENTER;
  const seed = (resource?.assetCode || "").split("").reduce(
    (acc, ch) => acc + ch.charCodeAt(0), 0
  );
  const jitterLat = ((seed % 17) - 8) * 0.000015;
  const jitterLng = ((seed % 23) - 11) * 0.000015;
  return { lat: base.lat + jitterLat, lng: base.lng + jitterLng };
}

(async () => {
  const snap = await db.collection("resources").get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const r = { id: doc.id, ...doc.data() };
    if (r.currentLocation) {
      skipped++;
      continue;
    }

    const coords = buildingCoordsForResource({
      assetCode: r.assetCode || r.id,
      location: r.location
    });

    await doc.ref.update({
      currentLocation: {
        campus: r.location?.campus || "Unknown",
        building: r.location?.building || "Unknown building",
        lat: coords.lat,
        lng: coords.lng,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "system-migration",
        source: "home"
      }
    });
    updated++;
  }

  console.log(
    `Backfill done. Updated: ${updated}. Skipped (already had field): ${skipped}.`
  );
  process.exit(0);
})().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
