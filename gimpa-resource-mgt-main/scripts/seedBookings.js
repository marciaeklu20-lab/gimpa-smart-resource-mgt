#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Seed ~20 sample booking documents so the Analytics dashboard has data.
 *
 * Uses the Firebase Admin SDK, which bypasses Firestore rules. To run:
 *
 *   1. From the Firebase console: Project settings -> Service accounts ->
 *      "Generate new private key". Save the JSON file.
 *   2. Point GOOGLE_APPLICATION_CREDENTIALS at it OR drop the file at
 *      gimpa-resource-mgt-main/scripts/serviceAccount.json (gitignored).
 *   3. node scripts/seedBookings.js [count]
 *
 * The script does NOT touch users or resources. The bookings reference
 * fake resourceIds/resourceNames; the Analytics charts read those fields
 * directly off the booking docs, so this is enough to populate them.
 *
 * Re-running the script creates ANOTHER batch of bookings — it does not
 * clear previous ones. Pass `--clear` to delete every seeded doc first
 * (identified by the `seedRun: true` marker we write below).
 */

const path = require("path");
const fs = require("fs");

const admin = require("firebase-admin");

// ---------------------------------------------------------------
// 1. Admin SDK init — prefer ADC, fall back to local JSON key.
// ---------------------------------------------------------------

const localKeyPath = path.join(__dirname, "serviceAccount.json");

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp();
} else if (fs.existsSync(localKeyPath)) {
  const cred = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(cred) });
} else {
  console.error(
    "No service-account credentials found.\n" +
    "Set GOOGLE_APPLICATION_CREDENTIALS or place a service account JSON " +
    "file at scripts/serviceAccount.json (see header comment for details)."
  );
  process.exit(1);
}

const db = admin.firestore();

// ---------------------------------------------------------------
// 2. Sample data — varied across every chart axis.
// ---------------------------------------------------------------

const RESOURCES = [
  { assetCode: "GIMPA-LAB-COMP-001",    name: "Computer Lab 1" },
  { assetCode: "GIMPA-LAB-COMP-002",    name: "Computer Lab 2" },
  { assetCode: "GIMPA-HALL-AUD-001",    name: "Main Auditorium" },
  { assetCode: "GIMPA-ROOM-CONF-001",   name: "Conference Room A" },
  { assetCode: "GIMPA-ROOM-CONF-002",   name: "Conference Room B" },
  { assetCode: "GIMPA-VEH-BUS-001",     name: "GIMPA Shuttle Bus" },
  { assetCode: "GIMPA-EQUIP-PROJ-001",  name: "Mobile Projector" },
  { assetCode: "GIMPA-HALL-LECT-001",   name: "Lecture Hall 3" }
];

const DEPARTMENTS = [
  "School Of Technology And Social Sciences",
  "GIMPA Law School",
  "Business School",
  "School Of Public Service And Governance",
  "School Of Research And Graduate Studies",
  null  // Central administration
];

const REQUESTER_PROFILES = [
  { role: "Course Rep",        nameTpl: "Course Rep ${i}",        deptIdx: 0 },
  { role: "Lecturer",          nameTpl: "Dr. Asante ${i}",        deptIdx: 1 },
  { role: "Lecturer",          nameTpl: "Dr. Mensah ${i}",        deptIdx: 2 },
  { role: "Teaching Assistant",nameTpl: "TA Owusu ${i}",          deptIdx: 3 },
  { role: "Maintenance Officer",nameTpl: "Maintenance ${i}",      deptIdx: 5 },
  { role: "Receptionist",      nameTpl: "Reception Desk ${i}",    deptIdx: 5 }
];

const STATUSES = ["pending", "approved", "approved", "approved", "rejected"];

const PURPOSES = [
  "Lecture session",
  "Project meeting",
  "Workshop",
  "Department seminar",
  "Faculty meeting",
  "Student orientation",
  "Research presentation"
];

// ---------------------------------------------------------------
// 3. Helpers — deterministic spread, not random, so reseeding looks
//    the same.
// ---------------------------------------------------------------

const pick = (arr, i) => arr[i % arr.length];

const buildBooking = (i) => {

  const resource = pick(RESOURCES, i);
  const profile = pick(REQUESTER_PROFILES, i);
  const department = DEPARTMENTS[profile.deptIdx];
  const status = pick(STATUSES, i);
  const purpose = pick(PURPOSES, i);

  // Spread bookings across the last ~3 weeks so day-of-week varies.
  const dayOffset = -((i * 2) % 21);
  const hourStart = 8 + (i % 8); // 08:00 .. 15:00
  const start = new Date();
  start.setDate(start.getDate() + dayOffset);
  start.setHours(hourStart, 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000); // +90 min

  // Mirror what createBooking + getBookingRecipients would compute.
  const isDeptRole = ["Course Rep", "Lecturer", "Teaching Assistant"].includes(profile.role);

  return {
    resourceId: resource.assetCode,
    resourceName: resource.name,

    requesterId: `seed-user-${i % REQUESTER_PROFILES.length}`,
    requesterName: profile.nameTpl.replace("${i}", String(i + 1)),
    requesterEmail: `seed${i}@gimpa.edu.gh`,
    requesterRole: profile.role,
    requesterDepartment: department,

    approvalRoute: isDeptRole ? "department" : "operations",
    visibleToRoles: isDeptRole
      ? ["Secretariat Admin", "Administrative Officer", "Higher Level Management", "super_admin"]
      : ["Facility/Estate Officer", "Stores/Inventory Officer", "Receptionist",
         "Administrative Officer", "Higher Level Management", "super_admin"],
    visibleToDepartment: isDeptRole ? department : null,

    purpose,
    startDate: start.toISOString(),
    endDate: end.toISOString(),

    status,
    approvedBy: status === "approved" ? "seed-approver" : null,
    rejectedBy: status === "rejected" ? "seed-approver" : null,

    createdAt: admin.firestore.FieldValue.serverTimestamp(),

    // Marker so --clear can find and delete only seeded docs.
    seedRun: true
  };

};

// ---------------------------------------------------------------
// 4. Main.
// ---------------------------------------------------------------

const args = process.argv.slice(2);
const shouldClear = args.includes("--clear");
const countArg = args.find((a) => /^\d+$/.test(a));
const count = countArg ? Number(countArg) : 20;

(async () => {

  if (shouldClear) {
    const snap = await db.collection("bookings").where("seedRun", "==", true).get();
    console.log(`Clearing ${snap.size} previously-seeded booking(s)...`);
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (!countArg) {
      console.log("Done.");
      process.exit(0);
    }
  }

  console.log(`Seeding ${count} booking(s)...`);

  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    const ref = db.collection("bookings").doc();
    batch.set(ref, buildBooking(i));
  }
  await batch.commit();

  console.log(`Done. ${count} bookings written to /bookings.`);
  process.exit(0);

})().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
