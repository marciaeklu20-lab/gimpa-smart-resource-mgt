#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * GIMPA Resource Management — investor-exhibition demo reset/seed.
 *
 * Single command to wipe Firestore data to a known state AND seed a
 * polished demo dataset (4 demo accounts, ~15 resources, ~10 bookings
 * in varied states, one booking with a pre-seeded chat thread).
 *
 * Run before every booth demo.
 *
 *   node scripts/seedDemoData.js                 # prompts for YES
 *   node scripts/seedDemoData.js --force         # no prompt
 *   node scripts/seedDemoData.js --skip-auth     # don't touch Auth accounts
 *
 * CREDENTIALS
 *   Provide the Admin SDK credentials in one of two ways (same as
 *   seedBookings.js):
 *     1. GOOGLE_APPLICATION_CREDENTIALS env var pointing at a service
 *        account JSON, OR
 *     2. Drop the service account JSON at scripts/serviceAccount.json
 *        (gitignored).
 *
 * SAFETY
 *   - Hardcoded project ID guard: aborts unless the credentials point
 *     at "gimpa-resource-mgt".
 *   - The super-admin user (marcia.ea.geal@gmail.com) is preserved
 *     through every wipe so we can still log in.
 *   - Idempotent: running twice produces the same final state. Auth
 *     accounts are recreated on each run; resources are upserted by
 *     deterministic IDs.
 *
 * DOCS
 *   See docs/DEMO_RESET.md for the operator playbook.
 */

const path = require("path");
const fs = require("fs");
const readline = require("readline");

const admin = require("firebase-admin");

// ---------------------------------------------------------------
// Constants — change with care.
// ---------------------------------------------------------------

const EXPECTED_PROJECT_ID = "gimpa-resource-mgt";
const SUPER_ADMIN_EMAIL = "marcia.ea.geal@gmail.com";
const DEMO_PASSWORD = "demo1234";

// Mirrors permissions.js — duplicated because this script can't
// import the React-side module (different module system / runtime).
const DEPARTMENT_ROLES = [
  "Course Rep",
  "Lecturer",
  "Teaching Assistant"
];

const OPERATIONAL_APPROVERS = [
  "Facility/Estate Officer",
  "Stores/Inventory Officer",
  "Receptionist"
];

const GLOBAL_APPROVERS = [
  "Administrative Officer",
  "Higher Level Management",
  "super_admin"
];

// Stage 4e.7: mirror of src/app/lib/categoryResponsibility.js. The
// React tree can't be imported into this Node CommonJS script, so the
// mapping is duplicated by hand. Keep in sync.
const CATEGORY_RESPONSIBILITY = {
  "Facilities":                         "Facility/Estate Officer",
  "Electronics & Electrical Equipment": "IT Officer",
  "Vehicles & Transport":               "Logistics Officer",
  "Furniture":                          "Facility/Estate Officer",
  "Office Supplies & Stationery":       "Stores/Inventory Officer",
  "Tools & Maintenance Equipment":      "Stores/Inventory Officer",
  "Other":                              "Stores/Inventory Officer"
};

const responsibleRoleForCategory = (category) =>
  CATEGORY_RESPONSIBILITY[category] || null;

// approvalRoutedTo = [responsible role for the resource's category,
// Secretariat Admin, super_admin]. Denormalized for query efficiency
// in subscribeBookings.
const approvalRouteForCategory = (category) => {
  const route = ["Secretariat Admin", "super_admin"];
  const responsible = responsibleRoleForCategory(category);
  if (responsible && !route.includes(responsible)) {
    route.unshift(responsible);
  }
  return route;
};

// Stage 4a lifecycle / condition enums — mirrors
// src/app/lib/resourceMeta.js. Kept here as raw strings because the
// seed runs under Node CommonJS and can't import from the ES-module
// React tree.
const LIFECYCLE = {
  ACTIVE: "active",
  IN_MAINTENANCE: "in_maintenance",
  RETIRED: "retired",
  DISPOSED: "disposed",
  LOST: "lost"
};

const COND = {
  EXCELLENT: "excellent",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
  OUT_OF_SERVICE: "out_of_service"
};

// ---------------------------------------------------------------
// CLI args.
// ---------------------------------------------------------------

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const SKIP_AUTH = args.includes("--skip-auth");

// ---------------------------------------------------------------
// 1. Admin SDK init — prefer ADC, fall back to local JSON key.
// ---------------------------------------------------------------

const localKeyPath = path.join(__dirname, "serviceAccount.json");

let credProjectId = null;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // ADC. Project ID will be inferred from the credential file or env.
  admin.initializeApp();
  try {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (fs.existsSync(credPath)) {
      const cred = JSON.parse(fs.readFileSync(credPath, "utf8"));
      credProjectId = cred.project_id || null;
    }
  } catch (_) {
    // Fall through — we'll catch the mismatch below if it matters.
  }
  credProjectId = credProjectId
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || null;
} else if (fs.existsSync(localKeyPath)) {
  const cred = JSON.parse(fs.readFileSync(localKeyPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(cred) });
  credProjectId = cred.project_id || null;
} else {
  console.error(
    "No service-account credentials found.\n" +
    "Set GOOGLE_APPLICATION_CREDENTIALS or place a service account JSON " +
    "file at scripts/serviceAccount.json. See the header comment of this " +
    "file (or docs/DEMO_RESET.md) for details."
  );
  process.exit(1);
}

// ---------------------------------------------------------------
// 2. SAFETY: project ID guard.
//    Refuses to run against anything but the GIMPA project.
// ---------------------------------------------------------------

if (!credProjectId) {
  console.error(
    `Could not determine the project ID from credentials.\n` +
    `Refusing to run for safety — this script must only target ` +
    `"${EXPECTED_PROJECT_ID}".`
  );
  process.exit(1);
}

if (credProjectId !== EXPECTED_PROJECT_ID) {
  console.error(
    `Project ID mismatch:\n` +
    `  credentials point at: ${credProjectId}\n` +
    `  this script expects:  ${EXPECTED_PROJECT_ID}\n` +
    `Aborting for safety.`
  );
  process.exit(1);
}

console.log(`Target project: ${credProjectId} ✓`);

const db = admin.firestore();
const auth = admin.auth();

// ---------------------------------------------------------------
// 3. Confirmation prompt.
// ---------------------------------------------------------------

const askConfirm = () => new Promise((resolve) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(
    `\nThis will WIPE all bookings, all resources, and all users\n` +
    `EXCEPT the super-admin (${SUPER_ADMIN_EMAIL}).\n\n` +
    `Type YES to confirm: `,
    (answer) => {
      rl.close();
      resolve(answer.trim());
    }
  );
});

// ---------------------------------------------------------------
// 4. Wipe helpers.
// ---------------------------------------------------------------

const wipeBookingsCollection = async () => {
  const snap = await db.collection("bookings").get();
  let count = 0;
  for (const docSnap of snap.docs) {
    // Delete the messages subcollection first (admin SDK doesn't
    // cascade), then the parent.
    const messages = await docSnap.ref.collection("messages").get();
    if (!messages.empty) {
      const batch = db.batch();
      messages.docs.forEach((m) => batch.delete(m.ref));
      await batch.commit();
    }
    await docSnap.ref.delete();
    count++;
  }
  return count;
};

const wipeResourcesCollection = async () => {
  const snap = await db.collection("resources").get();
  if (snap.empty) return 0;
  for (const docSnap of snap.docs) {
    // Stage 4a added three history subcollections. Admin SDK doesn't
    // cascade — delete each one before the parent resource, otherwise
    // a re-seed leaves orphaned audit entries from the prior run.
    for (const sub of ["conditionHistory", "lifecycleHistory", "custodianHistory", "transfers"]) {
      const subSnap = await docSnap.ref.collection(sub).get();
      if (subSnap.empty) continue;
      const batch = db.batch();
      subSnap.docs.forEach((s) => batch.delete(s.ref));
      await batch.commit();
    }
    await docSnap.ref.delete();
  }
  return snap.size;
};

// Stage 4d: faults collection wipe. Each fault carries a statusHistory
// subcollection; Admin SDK doesn't cascade, so we delete the subcoll
// before the parent. Storage objects (fault images) are not deleted
// here — we'd need to enumerate the bucket, which is out of scope for
// the seed reset. Acceptable; orphaned blobs are cheap.
// Stage 4e.8: supplyRequests wipe. Mirrors wipeFaultsCollection —
// each request carries a statusHistory subcollection we wipe first,
// then the parent doc.
const wipeSupplyRequestsCollection = async () => {
  const snap = await db.collection("supplyRequests").get();
  let count = 0;
  for (const docSnap of snap.docs) {
    const subs = await docSnap.ref.collection("statusHistory").get();
    for (const sub of subs.docs) {
      await sub.ref.delete();
    }
    await docSnap.ref.delete();
    count++;
  }
  return count;
};

const wipeFaultsCollection = async () => {
  const snap = await db.collection("faults").get();
  if (snap.empty) return 0;
  for (const docSnap of snap.docs) {
    // Stage 4e added the messages subcollection, Stage 4e.5 added
    // assignmentHistory. Admin SDK doesn't cascade — delete each one
    // before the parent fault, otherwise a re-seed leaves orphans.
    for (const sub of ["statusHistory", "assignmentHistory", "messages"]) {
      const subSnap = await docSnap.ref.collection(sub).get();
      if (subSnap.empty) continue;
      const batch = db.batch();
      subSnap.docs.forEach((s) => batch.delete(s.ref));
      await batch.commit();
    }
    await docSnap.ref.delete();
  }
  return snap.size;
};

const wipeUsersExceptSuperAdmin = async () => {
  const snap = await db.collection("users").get();
  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.email === SUPER_ADMIN_EMAIL) continue;
    await docSnap.ref.delete();
    count++;
  }
  return count;
};

// ---------------------------------------------------------------
// 5. Auth account seeding.
// ---------------------------------------------------------------

const DEMO_ACCOUNTS = [
  {
    email: "demo.student@st.gimpa.edu.gh",
    fullName: "Demo Student",
    userDoc: {
      role: "student",
      studentType: "General Student",
      studentID: "ST-DEMO-001",
      programme: "BSc Management Information Systems",
      department: null,
      approved: true,
      needsApproval: false
    }
  },
  {
    email: "demo.lecturer@gimpa.edu.gh",
    fullName: "Demo Lecturer",
    userDoc: {
      role: "Lecturer",
      department: "Business School",
      staffID: "STF-DEMO-001",
      approved: true,
      needsApproval: false
    }
  },
  {
    email: "demo.secretariat@gimpa.edu.gh",
    fullName: "Demo Secretariat",
    userDoc: {
      role: "Secretariat Admin",
      department: "Business School",
      staffID: "STF-DEMO-002",
      approved: true,
      needsApproval: false
    }
  },
  {
    email: "demo.facility@gimpa.edu.gh",
    fullName: "Demo Facility Officer",
    userDoc: {
      role: "Facility/Estate Officer",
      department: null,
      staffID: "STF-DEMO-003",
      approved: true,
      needsApproval: false
    }
  },
  {
    email: "demo.maintenance@gimpa.edu.gh",
    fullName: "Demo Maintenance",
    userDoc: {
      role: "Maintenance Staff",
      department: null,
      staffID: "STF-DEMO-004",
      approved: true,
      needsApproval: false
    }
  },
  // Stage 4e.5: Maintenance Admin — assigns faults, oversees the
  // maintenance domain, can override the assignee gate on workflow
  // actions. Distinct from super_admin (system superuser).
  {
    email: "demo.maintadmin@gimpa.edu.gh",
    fullName: "Demo Maintenance Admin",
    userDoc: {
      role: "Maintenance Admin",
      department: "Facilities & Maintenance",
      staffID: "STF-DEMO-005",
      approved: true,
      needsApproval: false
    }
  },
  // Stage 4e.5: second maintenance technician so the dropdown in
  // AssignFaultModal has more than one choice and the "not your
  // assignment" gating path is demonstrable.
  {
    email: "demo.maintenance2@gimpa.edu.gh",
    fullName: "Demo Maintenance Tech 2",
    userDoc: {
      role: "Maintenance Staff",
      department: "IT Maintenance",
      staffID: "STF-DEMO-006",
      approved: true,
      needsApproval: false
    }
  },
  // Stage 4e.7: Logistics Officer — owns the Vehicles & Transport
  // category. They can add/edit vehicle resources and approve
  // bookings on them.
  {
    email: "demo.logistics@gimpa.edu.gh",
    fullName: "Demo Logistics Officer",
    userDoc: {
      role: "Logistics Officer",
      department: "Transport & Logistics",
      staffID: "STF-DEMO-007",
      approved: true,
      needsApproval: false
    }
  },
  // Stage 4e.8: Stores/Inventory Officer — reviews supply requests
  // from maintenance staff. Owns the Office Supplies, Tools, and Other
  // resource slices via the Stage 4e.7 category responsibility map.
  {
    email: "demo.stores@gimpa.edu.gh",
    fullName: "Demo Stores Officer",
    userDoc: {
      role: "Stores/Inventory Officer",
      department: "Stores & Inventory",
      staffID: "STF-DEMO-008",
      approved: true,
      needsApproval: false
    }
  }
];

const createDemoAccount = async (account) => {
  // Idempotency: delete the existing Auth user (if any) and its user
  // doc, then recreate cleanly. We don't reuse the existing uid
  // because the existing user doc may have stale fields.
  try {
    const existing = await auth.getUserByEmail(account.email);
    await db.collection("users").doc(existing.uid).delete().catch(() => {});
    await auth.deleteUser(existing.uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw err;
    }
  }

  const newUser = await auth.createUser({
    email: account.email,
    password: DEMO_PASSWORD,
    emailVerified: true,
    displayName: account.fullName
  });

  await db.collection("users").doc(newUser.uid).set({
    uid: newUser.uid,
    email: account.email,
    fullName: account.fullName,
    ...account.userDoc,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { ...account, uid: newUser.uid };
};

// ---------------------------------------------------------------
// 6. Resource seeding.
// ---------------------------------------------------------------

// Stage 4a: every resource carries lifecycleStatus + condition +
// location + (optional) custodian + acquisition metadata. The mix
// below was chosen to demonstrate the system in a realistic state for
// the exhibition demo. Stage 4b adds one resource per previously-
// empty category (Furniture, Office Supplies, Tools, Other) so the
// category-card row never has a "0" tile in the demo.
//   - 15 active (2 excellent / 9 good / 3 fair / 1 poor)
//   -  2 in_maintenance (poor)
//   -  1 retired (out_of_service)
//   -  1 disposed (out_of_service)
//
// custodian is the email of one of the demo accounts; the seeder
// resolves it to the live uid at write time. Set to null to leave
// unassigned.
//
// Location strings are stored as the object form
// {campus, building, floor, room}.
const DEMO_RESOURCES = [
  // -------- Facilities — large venues -------------------------------
  {
    assetCode: "FAC-001",
    resourceName: "Main Auditorium",
    category: "Facilities",
    type: "Auditoriums",
    description: "Large auditorium suited for keynote talks and ceremonies.",
    capacity: "500",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.EXCELLENT,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Ground", room: "Auditorium" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2021-01-15",
    acquisitionCost: 1850000,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  {
    assetCode: "FAC-002",
    resourceName: "Conference Room A",
    category: "Facilities",
    type: "Conference Rooms",
    description: "Mid-size boardroom with conferencing AV.",
    capacity: "30",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Floor 1", room: "Room 101" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2022-03-10",
    acquisitionCost: 220000,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  {
    assetCode: "FAC-003",
    resourceName: "Conference Room B",
    category: "Facilities",
    type: "Conference Rooms",
    description: "Smaller meeting space for departmental sessions.",
    capacity: "16",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Floor 1", room: "Room 102" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2022-03-10",
    acquisitionCost: 180000,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  {
    assetCode: "FAC-004",
    resourceName: "Seminar Hall",
    category: "Facilities",
    type: "Halls",
    description: "Tiered seminar hall for workshops and trainings.",
    capacity: "120",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.FAIR,
    location: { campus: "Main Campus", building: "GIMPA Block B", floor: "Floor 2", room: "Seminar Hall" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2020-08-22",
    acquisitionCost: 620000,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  // -------- Labs ----------------------------------------------------
  {
    assetCode: "LAB-001",
    resourceName: "Computer Lab 1",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Computer lab with 40 workstations.",
    capacity: "40",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.EXCELLENT,
    location: { campus: "Main Campus", building: "IT Block", floor: "Floor 1", room: "Lab 1" },
    custodianEmail: "demo.maintenance@gimpa.edu.gh",
    acquisitionDate: "2024-02-05",
    acquisitionCost: 780000,
    warrantyExpiry: "2027-02-05",
    vendor: "HP Ghana"
  },
  {
    assetCode: "LAB-002",
    resourceName: "Computer Lab 2",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Computer lab with 36 workstations.",
    capacity: "36",
    lifecycleStatus: LIFECYCLE.IN_MAINTENANCE,
    condition: COND.POOR,
    location: { campus: "Main Campus", building: "IT Block", floor: "Floor 1", room: "Lab 2" },
    custodianEmail: "demo.maintenance@gimpa.edu.gh",
    acquisitionDate: "2019-09-12",
    acquisitionCost: 540000,
    warrantyExpiry: "2022-09-12",
    vendor: "HP Ghana"
  },
  {
    assetCode: "LAB-003",
    resourceName: "Engineering Lab",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Lab with engineering benches and equipment.",
    capacity: "24",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "Engineering Block", floor: "Ground", room: "Lab E1" },
    custodianEmail: "demo.maintenance@gimpa.edu.gh",
    acquisitionDate: "2023-06-18",
    acquisitionCost: 410000,
    warrantyExpiry: "2026-06-18",
    vendor: "Local Contractor"
  },
  {
    assetCode: "LAB-004",
    resourceName: "Lab Annex",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Annex space for overflow lab sessions.",
    capacity: "20",
    lifecycleStatus: LIFECYCLE.RETIRED,
    condition: COND.OUT_OF_SERVICE,
    location: { campus: "Main Campus", building: "Old Block", floor: "Floor 1", room: "Annex" },
    custodianEmail: null,
    acquisitionDate: "2015-04-01",
    acquisitionCost: 240000,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  // -------- Equipment ------------------------------------------------
  {
    assetCode: "EQP-001",
    resourceName: "Projector A",
    category: "Electronics & Electrical Equipment",
    type: "Projectors",
    description: "4K projector with HDMI / wireless casting.",
    quantity: 1,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Floor 1", room: "Room 101" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2024-08-01",
    acquisitionCost: 18500,
    warrantyExpiry: "2026-08-01",
    vendor: "HP Ghana"
  },
  {
    assetCode: "EQP-002",
    resourceName: "Projector B",
    category: "Electronics & Electrical Equipment",
    type: "Projectors",
    description: "Backup projector for events.",
    quantity: 1,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.FAIR,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Storage", room: "Storage A" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2022-01-20",
    acquisitionCost: 12000,
    warrantyExpiry: "2024-01-20",
    vendor: "HP Ghana"
  },
  {
    assetCode: "EQP-003",
    resourceName: "Sound System",
    category: "Electronics & Electrical Equipment",
    type: "AV Systems(e.g.,Speakers)",
    description: "Powered PA + wireless mics.",
    quantity: 1,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Ground", room: "Auditorium" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2023-11-05",
    acquisitionCost: 38000,
    warrantyExpiry: "2025-11-05",
    vendor: "Local Contractor"
  },
  {
    assetCode: "EQP-004",
    resourceName: "Camera Kit",
    category: "Electronics & Electrical Equipment",
    type: "AV Systems(e.g.,Speakers)",
    description: "DSLR + tripod + lighting for event capture.",
    quantity: 1,
    capacity: "",
    lifecycleStatus: LIFECYCLE.IN_MAINTENANCE,
    condition: COND.POOR,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Storage", room: "Storage A" },
    custodianEmail: "demo.maintenance@gimpa.edu.gh",
    acquisitionDate: "2021-05-15",
    acquisitionCost: 24500,
    warrantyExpiry: "2023-05-15",
    vendor: "Local Contractor"
  },
  // -------- Vehicles ------------------------------------------------
  {
    assetCode: "VEH-001",
    resourceName: "University Bus",
    category: "Vehicles & Transport",
    type: "Buses",
    description: "32-seater university shuttle bus.",
    quantity: 1,
    capacity: "32",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.POOR,
    location: { campus: "Main Campus", building: "Transport Yard", floor: "Ground", room: "Bay 1" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2023-02-10",
    acquisitionCost: 285000,
    warrantyExpiry: "2026-02-10",
    vendor: "Toyota Ghana"
  },
  {
    assetCode: "VEH-002",
    resourceName: "Sedan-01",
    category: "Vehicles & Transport",
    type: "Cars",
    description: "Executive sedan for official trips.",
    quantity: 1,
    capacity: "4",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.FAIR,
    location: { campus: "Main Campus", building: "Transport Yard", floor: "Ground", room: "Bay 2" },
    custodianEmail: "demo.secretariat@gimpa.edu.gh",
    acquisitionDate: "2020-07-22",
    acquisitionCost: 165000,
    warrantyExpiry: null,
    vendor: "Toyota Ghana"
  },
  {
    assetCode: "VEH-003",
    resourceName: "Pickup Truck",
    category: "Vehicles & Transport",
    type: "Vans",
    description: "Pickup for equipment transport.",
    quantity: 1,
    capacity: "3",
    lifecycleStatus: LIFECYCLE.DISPOSED,
    condition: COND.OUT_OF_SERVICE,
    location: { campus: "Main Campus", building: "Transport Yard", floor: "Ground", room: "Bay 5" },
    custodianEmail: null,
    acquisitionDate: "2014-10-03",
    acquisitionCost: 120000,
    warrantyExpiry: null,
    vendor: "Toyota Ghana"
  },
  // -------- Furniture -----------------------------------------------
  // Stage 4b: one resource per category that was previously empty, so
  // the category-card row in the demo never shows a 0-count tile.
  {
    assetCode: "FRN-001",
    resourceName: "Executive Office Chair Set",
    category: "Furniture",
    type: "Chairs",
    description: "Ergonomic office chairs for staff offices.",
    quantity: 10,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "GIMPA Block A", floor: "Floor 2", room: "Staff Offices" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2023-04-12",
    acquisitionCost: 14500,
    warrantyExpiry: "2025-04-12",
    vendor: "Local Contractor"
  },
  // -------- Office Supplies & Stationery ----------------------------
  {
    assetCode: "OSS-001",
    resourceName: "A4 Paper Reams",
    category: "Office Supplies & Stationery",
    type: "Paper Reams",
    description: "Boxes of A4 printing paper for admin offices.",
    quantity: 50,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "Stores Block", floor: "Ground", room: "Stationery Store" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2025-09-01",
    acquisitionCost: 4200,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  },
  // -------- Tools & Maintenance Equipment ---------------------------
  {
    assetCode: "TLS-001",
    resourceName: "Maintenance Tool Kit",
    category: "Tools & Maintenance Equipment",
    type: "Tool Kits",
    description: "Maintenance kit (drill, screwdrivers, multimeter, etc.).",
    quantity: 1,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "Stores Block", floor: "Ground", room: "Workshop" },
    custodianEmail: "demo.maintenance@gimpa.edu.gh",
    acquisitionDate: "2024-01-20",
    acquisitionCost: 8500,
    warrantyExpiry: "2026-01-20",
    vendor: "Local Contractor"
  },
  // -------- Other ---------------------------------------------------
  {
    assetCode: "OTH-001",
    resourceName: "Branding Banner Set",
    category: "Other",
    type: "Event Banners",
    description: "Roll-up branding banners for institutional events.",
    quantity: 6,
    capacity: "",
    lifecycleStatus: LIFECYCLE.ACTIVE,
    condition: COND.GOOD,
    location: { campus: "Main Campus", building: "Stores Block", floor: "Ground", room: "Event Storage" },
    custodianEmail: "demo.facility@gimpa.edu.gh",
    acquisitionDate: "2024-06-10",
    acquisitionCost: 5200,
    warrantyExpiry: null,
    vendor: "Local Contractor"
  }
];

// Resolve a demo email to the seeded uid, so changedBy / custodianId
// stay referentially correct on the history docs. Returns null when
// the demo account wasn't seeded (e.g. --skip-auth flows).
const uidForEmail = (accountsByEmail, email) => {
  if (!email) return null;
  const acc = accountsByEmail[email];
  return acc ? acc.uid : null;
};

const fullNameForEmail = (accountsByEmail, email) => {
  if (!email) return null;
  const acc = accountsByEmail[email];
  return acc ? acc.fullName : null;
};

const toDateOrNull = (isoDay) => {
  if (!isoDay) return null;
  const d = new Date(isoDay);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const seedResources = async (accountsByEmail, superAdminActor) => {
  for (const r of DEMO_RESOURCES) {

    const custodianUid = uidForEmail(accountsByEmail, r.custodianEmail);
    const custodianName = fullNameForEmail(accountsByEmail, r.custodianEmail);
    const custodianAssignedAt = custodianUid
      ? admin.firestore.FieldValue.serverTimestamp()
      : null;

    await db.collection("resources").doc(r.assetCode).set({
      assetCode: r.assetCode,
      resourceName: r.resourceName,
      category: r.category,
      type: r.type,
      description: r.description || "",
      // Mirrors AddResourceForm.jsx: Facilities don't carry a quantity.
      quantity: r.category === "Facilities" ? null : (r.quantity ?? 1),
      capacity: r.capacity || "",

      // Stage 4a asset-management fields.
      lifecycleStatus: r.lifecycleStatus,
      condition: r.condition,
      location: r.location || null,
      custodianId: custodianUid,
      custodianName: custodianName,
      custodianAssignedAt: custodianAssignedAt,
      acquisitionDate: toDateOrNull(r.acquisitionDate),
      acquisitionCost: typeof r.acquisitionCost === "number" ? r.acquisitionCost : null,
      warrantyExpiry: toDateOrNull(r.warrantyExpiry),
      vendor: r.vendor || null,

      // Stage 4e.7: category responsibility partitioning. Derived
      // here so every seeded resource lines up with the rules' write
      // gate (request.resource.data.responsibleRole == myRole()).
      responsibleRole: responsibleRoleForCategory(r.category),

      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Initial history entries. The seed runs as super_admin so every
    // resource has provenance: "this was registered, by whom, at what
    // status and condition."
    const ref = db.collection("resources").doc(r.assetCode);

    await ref.collection("conditionHistory").add({
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
      oldCondition: null,
      newCondition: r.condition,
      reason: "Initial registration",
      changedBy: superAdminActor
    });

    await ref.collection("lifecycleHistory").add({
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
      oldStatus: null,
      newStatus: r.lifecycleStatus,
      reason: "Initial registration",
      changedBy: superAdminActor
    });

    if (custodianUid) {
      await ref.collection("custodianHistory").add({
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        oldCustodianId: null,
        newCustodianId: custodianUid,
        reason: "Initial assignment",
        changedBy: superAdminActor
      });
    }
  }
  return DEMO_RESOURCES.length;
};

// ---------------------------------------------------------------
// 6b. Transfer seeding (Stage 4h).
// ---------------------------------------------------------------
//
// Two sample transfers so the AssetDetailPanel's Transfer History
// section has content on first load and reviewers can see the
// closed loop between live resource state + immutable audit. Each
// write is atomic (writeBatch: parent resource update + transfers
// entry) and timestamps are backdated so the entries look like
// genuine history rather than a fresh seed run.

const DEMO_TRANSFERS = [
  {
    // Transfer 1: EQP-001 Projector A — custodian + location change.
    // Updates the parent resource doc so live state matches the
    // audit entry (Conference Room A → Conference Room B; Facility
    // Officer → Maintenance).
    resourceId: "EQP-001",
    oldCustodianEmail: "demo.facility@gimpa.edu.gh",
    newCustodianEmail: "demo.maintenance@gimpa.edu.gh",
    oldLocation: {
      campus: "Main Campus", building: "GIMPA Block A",
      floor: "Floor 1", room: "Room 101"
    },
    newLocation: {
      campus: "Main Campus", building: "GIMPA Block A",
      floor: "Floor 1", room: "Room 102"
    },
    reason:
      "Moved to Conference Room B for the quarterly executive " +
      "presentations through the next month.",
    transferredByEmail: "demo.secretariat@gimpa.edu.gh",
    daysAgo: 14
  },
  {
    // Transfer 2: TLS-001 Maintenance Tool Kit — location-only.
    // Custodian stays demo.maintenance on both sides so
    // custodianChanged is false. Demonstrates the
    // locationChanged-only branch of the audit entry.
    resourceId: "TLS-001",
    oldCustodianEmail: "demo.maintenance@gimpa.edu.gh",
    newCustodianEmail: "demo.maintenance@gimpa.edu.gh",
    oldLocation: {
      campus: "Main Campus", building: "Stores Block",
      floor: "Ground", room: "Workshop"
    },
    newLocation: {
      campus: "Main Campus", building: "IT Block",
      floor: "Floor 1", room: "Lab 2"
    },
    reason:
      "Relocated for the Computer Lab 2 black-screen investigation " +
      "flagged in the maintenance log.",
    transferredByEmail: "demo.maintadmin@gimpa.edu.gh",
    daysAgo: 3
  }
];

const seedTransfers = async (accountsByEmail) => {

  let written = 0;

  for (const t of DEMO_TRANSFERS) {

    const transferredByAccount = accountsByEmail[t.transferredByEmail];
    if (!transferredByAccount) {
      console.warn(
        `  ! skipping transfer for ${t.resourceId}: ` +
        `actor ${t.transferredByEmail} not in seeded accounts`
      );
      continue;
    }
    const actor = {
      uid: transferredByAccount.uid,
      name: transferredByAccount.fullName,
      role: transferredByAccount.userDoc.role
    };

    const oldCustodian = t.oldCustodianEmail
      ? (() => {
          const acc = accountsByEmail[t.oldCustodianEmail];
          return acc
            ? { uid: acc.uid, name: acc.fullName }
            : null;
        })()
      : null;
    const newCustodian = t.newCustodianEmail
      ? (() => {
          const acc = accountsByEmail[t.newCustodianEmail];
          return acc
            ? { uid: acc.uid, name: acc.fullName }
            : null;
        })()
      : null;

    const custodianChanged =
      (oldCustodian?.uid || null) !== (newCustodian?.uid || null);
    const locationChanged = !(
      (t.oldLocation?.campus   || "") === (t.newLocation?.campus   || "")
      && (t.oldLocation?.building || "") === (t.newLocation?.building || "")
      && (t.oldLocation?.floor    || "") === (t.newLocation?.floor    || "")
      && (t.oldLocation?.room     || "") === (t.newLocation?.room     || "")
    );

    if (!custodianChanged && !locationChanged) {
      console.warn(
        `  ! skipping transfer for ${t.resourceId}: ` +
        `neither custodian nor location changed`
      );
      continue;
    }

    const transferredAt = admin.firestore.Timestamp.fromMillis(
      Date.now() - t.daysAgo * 24 * 60 * 60 * 1000
    );

    const resourceRef = db.collection("resources").doc(t.resourceId);
    const transferRef = resourceRef.collection("transfers").doc();

    const resourcePatch = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (custodianChanged) {
      resourcePatch.custodianId = newCustodian?.uid || null;
      resourcePatch.custodianName = newCustodian?.name || null;
      resourcePatch.custodianAssignedAt = transferredAt;
    }
    if (locationChanged) {
      resourcePatch.location = t.newLocation;
    }

    const batch = db.batch();
    batch.update(resourceRef, resourcePatch);
    batch.set(transferRef, {
      transferredAt,
      oldCustodian,
      newCustodian,
      custodianChanged,
      oldLocation: t.oldLocation,
      newLocation: t.newLocation,
      locationChanged,
      reason: t.reason,
      transferredBy: actor
    });
    await batch.commit();

    written++;
  }

  return written;
};

// ---------------------------------------------------------------
// 7. Booking seeding.
// ---------------------------------------------------------------

// Mirrors getBookingRecipients.js — kept in sync manually.
const routeForRole = (role, department) => {
  if (DEPARTMENT_ROLES.includes(role)) {
    return {
      approvalRoute: "department",
      visibleToRoles: ["Secretariat Admin", ...GLOBAL_APPROVERS],
      visibleToDepartment: department
    };
  }
  return {
    approvalRoute: "operations",
    visibleToRoles: [...OPERATIONAL_APPROVERS, ...GLOBAL_APPROVERS],
    visibleToDepartment: null
  };
};

const findResource = (assetCode) =>
  DEMO_RESOURCES.find((r) => r.assetCode === assetCode);

const dayOffset = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const buildBooking = ({
  requester,
  assetCode,
  status,
  startDate,
  endDate,
  purpose,
  approver
}) => {
  const resource = findResource(assetCode);
  const routing = routeForRole(requester.role, requester.department);

  return {
    resourceId: resource.assetCode,
    resourceName: resource.resourceName,
    resourceCategory: resource.category,
    resourceResponsibleRole: responsibleRoleForCategory(resource.category),

    requesterId: requester.uid,
    requesterName: requester.fullName,
    requesterEmail: requester.email,
    requesterRole: requester.role,
    requesterDepartment: requester.department ?? null,

    approvalRoute: routing.approvalRoute,
    visibleToRoles: routing.visibleToRoles,
    visibleToDepartment: routing.visibleToDepartment,

    // Stage 4e.7: partitioned approval routing. subscribeBookings +
    // approveBooking + the bookings update rule all key off this list.
    approvalRoutedTo: approvalRouteForCategory(resource.category),

    purpose,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),

    status,
    approvedBy: status === "approved" ? (approver || "demo.secretariat@gimpa.edu.gh") : null,
    rejectedBy: status === "rejected" ? (approver || "demo.secretariat@gimpa.edu.gh") : null,

    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
};

const seedBookings = async (accountsByEmail) => {

  const student = accountsByEmail["demo.student@st.gimpa.edu.gh"];
  const lecturer = accountsByEmail["demo.lecturer@gimpa.edu.gh"];
  const secretariat = accountsByEmail["demo.secretariat@gimpa.edu.gh"];
  const facility = accountsByEmail["demo.facility@gimpa.edu.gh"];

  // Compose a normalized requester object that buildBooking can read
  // — needs uid/fullName/email/role/department populated.
  const asRequester = (acc) => ({
    uid: acc.uid,
    fullName: acc.fullName,
    email: acc.email,
    role: acc.userDoc.role,
    department: acc.userDoc.department
  });

  const studentRequester = asRequester(student);
  const lecturerRequester = asRequester(lecturer);

  // ----- 3 approved bookings (past + future) -----
  const approved1 = buildBooking({
    requester: lecturerRequester,
    assetCode: "FAC-002",
    status: "approved",
    startDate: dayOffset(-7, 10),
    endDate: dayOffset(-7, 12),
    purpose: "Faculty workshop — last week's session"
  });

  const approved2 = buildBooking({
    requester: lecturerRequester,
    assetCode: "LAB-001",
    status: "approved",
    startDate: dayOffset(2, 9),
    endDate: dayOffset(2, 11),
    purpose: "Practical class for MIS students"
  });

  const approved3 = buildBooking({
    requester: studentRequester,
    assetCode: "EQP-001",
    status: "approved",
    startDate: dayOffset(14, 13),
    endDate: dayOffset(14, 15),
    purpose: "Student association meeting — projector pickup"
  });

  // ----- 2 pending bookings (general queue) -----
  const pending1 = buildBooking({
    requester: studentRequester,
    assetCode: "EQP-003",
    status: "pending",
    startDate: dayOffset(3, 14),
    endDate: dayOffset(3, 17),
    purpose: "Cultural event — PA system request"
  });

  const pending2 = buildBooking({
    requester: lecturerRequester,
    assetCode: "FAC-004",
    status: "pending",
    startDate: dayOffset(5, 10),
    endDate: dayOffset(5, 13),
    purpose: "Departmental research seminar"
  });

  // ----- 2 rejected bookings -----
  const rejected1 = buildBooking({
    requester: studentRequester,
    assetCode: "VEH-001",
    status: "rejected",
    startDate: dayOffset(-14, 8),
    endDate: dayOffset(-14, 18),
    purpose: "Off-campus excursion (declined: insurance)"
  });

  const rejected2 = buildBooking({
    requester: lecturerRequester,
    assetCode: "FAC-001",
    status: "rejected",
    startDate: dayOffset(-3, 9),
    endDate: dayOffset(-3, 17),
    purpose: "Faculty retreat (declined: clash with convocation)"
  });

  // ----- The featured "live demo" booking: lecturer pending for
  //       tomorrow afternoon. This one drives the on-stage approval
  //       flow. -----
  const lecturerDemo = buildBooking({
    requester: lecturerRequester,
    assetCode: "FAC-002",
    status: "pending",
    startDate: dayOffset(1, 14),
    endDate: dayOffset(1, 16),
    purpose: "Investor walkthrough — Conference Room A"
  });

  // ----- The featured "live chat" booking: student-pending with a
  //       pre-seeded conversation. Visible to approvers (admin sees
  //       all; Facility/Estate Officer sees it via the operations
  //       route). Marked as already-read by the student so the chat
  //       appears unread for the approver — they'll see the NEW badge
  //       immediately on login. -----
  const chatBooking = buildBooking({
    requester: studentRequester,
    assetCode: "FAC-003",
    status: "pending",
    startDate: dayOffset(5, 14),
    endDate: dayOffset(5, 16),
    purpose: "Project showcase — Conference Room B"
  });

  // Write the non-chat bookings.
  const plainBookings = [
    approved1, approved2, approved3,
    pending1, pending2,
    rejected1, rejected2,
    lecturerDemo
  ];

  const refs = [];
  for (const b of plainBookings) {
    const ref = db.collection("bookings").doc();
    await ref.set(b);
    refs.push(ref);
  }

  // Write the chat booking + its messages subcollection + parent
  // chat-metadata fields.
  const chatRef = db.collection("bookings").doc();

  const now = Date.now();
  const tsAgo = (minutesAgo) =>
    admin.firestore.Timestamp.fromMillis(now - minutesAgo * 60 * 1000);

  // Conversation ends with a STUDENT message so that BOTH approver
  // personas (Secretariat Admin and Facility/Estate Officer) see the
  // NEW badge on login — isUnread short-circuits to false when the
  // viewer is the latest author.
  const messages = [
    {
      authorId: student.uid,
      authorName: student.fullName,
      authorRole: student.userDoc.role,
      text:
        "Hello, I'd like to confirm whether the projector in Conference Room B is " +
        "already set up, or whether I should request EQP-001 separately?",
      createdAt: tsAgo(120)
    },
    {
      authorId: facility.uid,
      authorName: facility.fullName,
      authorRole: facility.userDoc.role,
      text:
        "Good day. Conference Room B has a built-in projector. No separate " +
        "request is needed. Could you confirm the expected attendance so we " +
        "can prepare the room?",
      createdAt: tsAgo(90)
    },
    {
      authorId: student.uid,
      authorName: student.fullName,
      authorRole: student.userDoc.role,
      text:
        "Thank you. We're expecting about 12 attendees from the project team " +
        "plus 2 supervisors.",
      createdAt: tsAgo(60)
    },
    {
      authorId: student.uid,
      authorName: student.fullName,
      authorRole: student.userDoc.role,
      text:
        "One more thing — could you confirm whether the room has a usable " +
        "whiteboard? We'd prefer not to bring our own.",
      createdAt: tsAgo(30)
    }
  ];

  const latest = messages[messages.length - 1];
  const chatBookingDoc = {
    ...chatBooking,
    lastMessageAt: latest.createdAt,
    lastMessageAuthorId: latest.authorId,
    // Student is "caught up"; secretariat / facility have NOT read it,
    // so they get the NEW badge on login.
    lastReadByUser: {
      [student.uid]: latest.createdAt
    }
  };

  await chatRef.set(chatBookingDoc);
  refs.push(chatRef);

  const mb = db.batch();
  for (const m of messages) {
    const mref = chatRef.collection("messages").doc();
    mb.set(mref, m);
  }
  await mb.commit();

  return refs.length;

};

// ---------------------------------------------------------------
// 7a. Faults (Stage 4d).
//
// Seeds 3 pending faults so the Maintenance Faults sub-tab has
// content on first load. One carries a placeholder image URL (NOT
// uploaded to Storage — see spec): the browser loads it directly
// from the CDN. Each fault gets its initial statusHistory entry
// written in the same batch.
// ---------------------------------------------------------------

const DEMO_FAULTS = [
  {
    // Intentionally unassigned so the "Unassigned Faults" KPI is > 0
    // and the demo flow has an obvious target for the maintadmin
    // assign action.
    resourceId: "LAB-002",
    resourceName: "Computer Lab 2",
    resourceCategory: "Facilities",
    reporterEmail: "demo.student@st.gimpa.edu.gh",
    description:
      "Two workstations at the back have black screens after boot. " +
      "Power cycling doesn't fix — they reach the login screen then go black.",
    severity: "major",
    imageUrl: null,
    assignToEmail: null
  },
  {
    resourceId: "EQP-004",
    resourceName: "Camera Kit",
    resourceCategory: "Electronics & Electrical Equipment",
    reporterEmail: "demo.lecturer@gimpa.edu.gh",
    description:
      "Camera battery dies after roughly 20 minutes of recording. " +
      "Barely usable for an event longer than a single talk.",
    severity: "minor",
    imageUrl: null,
    // Pre-assigned to the second technician so "My Assignments" shows
    // them a single fault while the cracked-lens stays with demo.maintenance.
    assignToEmail: "demo.maintenance2@gimpa.edu.gh",
    // Stage 4f: pre-resolved by the assignee so reviewers see the
    // closed maintenance loop on first load — the EQP-004 asset's
    // condition flips from POOR to GOOD via the resolve flow's atomic
    // 4-op batch, and its conditionHistory shows the "Resolved from
    // fault: <id>" entry. lifecycleStatus stays IN_MAINTENANCE per
    // spec (no auto lifecycle changes).
    resolveWith: {
      resolverEmail: "demo.maintenance2@gimpa.edu.gh",
      newCondition: "good",
      notes:
        "Battery replaced; tested over 90 minutes of recording " +
        "without dropouts. Back to spec.",
      minutesAgo: 30
    }
  },
  {
    resourceId: "EQP-001",
    resourceName: "Projector A",
    resourceCategory: "Electronics & Electrical Equipment",
    reporterEmail: "demo.lecturer@gimpa.edu.gh",
    description:
      "Lens has a hairline crack — projected image now has a visible " +
      "dark line across the right edge. Photo attached.",
    severity: "major",
    imageUrl: "https://placehold.co/600x400/png?text=Cracked+Lens",
    // Pre-assigned to demo.maintenance so the cracked-lens seed chat
    // (lecturer ↔ maintenance) lines up with the assignee.
    assignToEmail: "demo.maintenance@gimpa.edu.gh",
    // Stage 4e: pre-seeded chat thread on the cracked-lens fault so
    // reviewers see a live conversation on first load. Last message
    // is intentionally from maintenance (not the reporter) so future
    // unread-badge logic has something to surface for the lecturer.
    messages: [
      {
        authorEmail: "demo.lecturer@gimpa.edu.gh",
        text:
          "I noticed this during this morning's lecture — the projection " +
          "now has a dark line down the right edge. Is this a lens issue " +
          "or the panel?",
        minutesAgo: 90
      },
      {
        authorEmail: "demo.maintenance@gimpa.edu.gh",
        text:
          "Thanks for the photo — that does look like a lens crack. We'll " +
          "bring it in for inspection and let you know if it needs a swap.",
        minutesAgo: 30
      }
    ]
  }
];

const seedFaults = async (accountsByEmail) => {

  let written = 0;
  // Stage 4e.8: keyed by resourceId so seedSupplyRequests can resolve
  // a "linked fault on EQP-001" reference back to the live fault doc.
  const faultIdByResource = {};

  // Stage 4e.5: maintenance admin who is recorded as the actor on
  // every pre-seeded assignment (changedBy + assignedBy). If the demo
  // admin account couldn't be seeded, fall back to a system placeholder
  // so the seed still runs cleanly.
  const maintAdminAccount = accountsByEmail["demo.maintadmin@gimpa.edu.gh"];
  const maintAdminActor = maintAdminAccount
    ? {
        uid: maintAdminAccount.uid,
        name: maintAdminAccount.fullName,
        role: maintAdminAccount.userDoc.role
      }
    : { uid: "system", name: "System (seed)", role: "super_admin" };

  for (const f of DEMO_FAULTS) {

    const reporter = accountsByEmail[f.reporterEmail];
    if (!reporter) {
      console.warn(
        `  ! skipping fault for ${f.resourceId}: ` +
        `reporter ${f.reporterEmail} not found in seeded accounts`
      );
      continue;
    }

    const actor = {
      uid: reporter.uid,
      name: reporter.fullName,
      role: reporter.userDoc.role
    };

    // Resolve assignee account (if any) up front so we can stamp the
    // fault doc + assignmentHistory in the same batch as the parent.
    const assigneeAccount = f.assignToEmail
      ? accountsByEmail[f.assignToEmail]
      : null;
    const assignedTo = assigneeAccount
      ? {
          uid: assigneeAccount.uid,
          name: assigneeAccount.fullName,
          role: assigneeAccount.userDoc.role
        }
      : null;

    const faultRef = db.collection("faults").doc();
    faultIdByResource[f.resourceId] = faultRef.id;

    // Stage 4f: resolveWith pre-resolves the fault to demonstrate the
    // closed maintenance loop. Resolver actor + backdated timestamp +
    // new condition all derived here so the batch below mirrors the
    // live updateFaultStatus.js 4-op write.
    let resolveActor = null;
    let resolvedAtTs = null;
    if (f.resolveWith) {
      const resolverAccount = accountsByEmail[f.resolveWith.resolverEmail];
      if (resolverAccount) {
        resolveActor = {
          uid: resolverAccount.uid,
          name: resolverAccount.fullName,
          role: resolverAccount.userDoc.role
        };
      }
      const minutesAgo = typeof f.resolveWith.minutesAgo === "number"
        ? f.resolveWith.minutesAgo
        : 30;
      resolvedAtTs = admin.firestore.Timestamp.fromMillis(
        Date.now() - minutesAgo * 60 * 1000
      );
    }
    const isPreResolved = !!(f.resolveWith && resolveActor && resolvedAtTs);

    const faultData = {
      resourceId: f.resourceId,
      resourceName: f.resourceName,
      resourceCategory: f.resourceCategory,

      reporterId: reporter.uid,
      reporterName: reporter.fullName,
      reporterRole: reporter.userDoc.role,
      reporterDepartment: reporter.userDoc.department || null,

      description: f.description,
      severity: f.severity,

      imageUrl: f.imageUrl,
      imageStoragePath: null,

      status: isPreResolved ? "resolved" : "pending",
      routedToRoles: ["super_admin", "Maintenance Admin", "Maintenance Staff"],

      // Stage 4e.5 assignment fields. assignedAt is stamped with
      // serverTimestamp when an assignee was supplied; null otherwise.
      assignedTo,
      assignedAt: assignedTo
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      assignedBy: assignedTo ? maintAdminActor : null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      acknowledgedAt: null,
      acknowledgedBy: null,
      inProgressAt: null,
      resolvedAt: isPreResolved ? resolvedAtTs : null,
      resolvedBy: isPreResolved ? resolveActor : null,
      resolutionNotes: isPreResolved ? f.resolveWith.notes : null,
      newConditionAfterResolution: isPreResolved
        ? f.resolveWith.newCondition
        : null
    };

    const historyRef = faultRef.collection("statusHistory").doc();
    const historyData = {
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
      oldStatus: null,
      newStatus: "pending",
      notes: "Fault reported",
      changedBy: actor
    };

    const batch = db.batch();
    batch.set(faultRef, faultData);
    batch.set(historyRef, historyData);

    // Write the initial assignmentHistory entry alongside the fault
    // so the audit trail starts from t=0 rather than waiting for a
    // future write. changedBy = maintadmin per spec.
    if (assignedTo) {
      const assignHistoryRef = faultRef.collection("assignmentHistory").doc();
      batch.set(assignHistoryRef, {
        changedAt: admin.firestore.FieldValue.serverTimestamp(),
        oldAssignee: null,
        newAssignee: assignedTo,
        reason: "Initial assignment by maintenance admin",
        changedBy: maintAdminActor
      });
    }

    // Stage 4f: pre-resolved demo path — same 4-op atomic shape as
    // updateFaultStatus.js, folded into the seed batch so the seed
    // emits the closed-loop demo in a single commit:
    //   1. fault doc set above (status: "resolved")
    //   2. second statusHistory entry: pending → resolved
    //   3. resource doc condition flip
    //   4. resource conditionHistory entry referencing the fault id
    if (isPreResolved) {
      const resolvedHistoryRef = faultRef.collection("statusHistory").doc();
      batch.set(resolvedHistoryRef, {
        changedAt: resolvedAtTs,
        oldStatus: "pending",
        newStatus: "resolved",
        notes: f.resolveWith.notes,
        changedBy: resolveActor
      });

      const resourceRef = db.collection("resources").doc(f.resourceId);
      batch.update(resourceRef, {
        condition: f.resolveWith.newCondition,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const condHistoryRef = resourceRef.collection("conditionHistory").doc();
      batch.set(condHistoryRef, {
        changedAt: resolvedAtTs,
        // oldCondition mirrors what seedResources just wrote — the
        // catalogue entry is the source of truth for the pre-resolve
        // condition.
        oldCondition: findDemoResource(f.resourceId)?.condition || null,
        newCondition: f.resolveWith.newCondition,
        reason: `Resolved from fault: ${faultRef.id}`,
        changedBy: resolveActor
      });
    }

    await batch.commit();

    // Stage 4e: optional pre-seeded chat thread (currently only on
    // the cracked-lens fault). Written in a second batch since the
    // parent fault must exist first for the rules update branch.
    if (Array.isArray(f.messages) && f.messages.length > 0) {
      const now = Date.now();
      const tsAgo = (minutesAgo) =>
        admin.firestore.Timestamp.fromMillis(now - minutesAgo * 60 * 1000);

      const resolvedMessages = f.messages
        .map((m) => {
          const author = accountsByEmail[m.authorEmail];
          if (!author) {
            console.warn(
              `  ! skipping chat message: author ${m.authorEmail} ` +
              `not in seeded accounts`
            );
            return null;
          }
          return {
            authorId: author.uid,
            authorName: author.fullName,
            authorRole: author.userDoc.role,
            text: m.text,
            createdAt: tsAgo(m.minutesAgo)
          };
        })
        .filter(Boolean);

      if (resolvedMessages.length > 0) {
        const chatBatch = db.batch();
        for (const m of resolvedMessages) {
          const mref = faultRef.collection("messages").doc();
          chatBatch.set(mref, m);
        }

        // Stamp parent-fault metadata so the future-fault-unread
        // pattern has hydrated fields to read. lastReadByUser carries
        // each author's own message time — they implicitly "read"
        // what they wrote, mirroring sendFaultMessage's batch.
        const latest = resolvedMessages[resolvedMessages.length - 1];
        const lastReadByUser = {};
        for (const m of resolvedMessages) {
          if (!lastReadByUser[m.authorId]) {
            lastReadByUser[m.authorId] = m.createdAt;
          } else if (m.createdAt.toMillis() > lastReadByUser[m.authorId].toMillis()) {
            lastReadByUser[m.authorId] = m.createdAt;
          }
        }

        chatBatch.update(faultRef, {
          lastMessageAt: latest.createdAt,
          lastMessageAuthorId: latest.authorId,
          lastReadByUser
        });

        await chatBatch.commit();
      }
    }

    written++;
  }

  return { written, faultIdByResource };
};

// ---------------------------------------------------------------
// 7b. Supply request seeding (Stage 4e.8).
// ---------------------------------------------------------------
//
// Three demo requests covering each non-terminal lifecycle stage so a
// reviewer can see pending review (Stores' main queue), approved
// (waiting fulfillment), and fulfilled (closed loop) without taking
// any action. Linked-fault is wired up via faultResourceId so the
// seeded request can point at the matching live fault doc.

const DEMO_SUPPLY_REQUESTS = [
  {
    // PENDING — links to the cracked-lens fault on Projector A. Mixed-
    // item example so the items table renders multi-row in the demo.
    requesterEmail: "demo.maintenance@gimpa.edu.gh",
    faultResourceId: "EQP-001",
    items: [
      { resourceAssetCode: "TLS-001", quantityRequested: 1, unit: "set" },
      { resourceAssetCode: "OSS-001", quantityRequested: 5, unit: "boxes" }
    ],
    reason:
      "Need supplies to inspect and document the cracked lens incident " +
      "on Projector A — tool kit for disassembly, paper for the report.",
    status: "pending",
    minutesAgo: 40
  },
  {
    // APPROVED — standalone request from the second maintenance tech.
    // Approved by stores; not yet fulfilled.
    requesterEmail: "demo.maintenance2@gimpa.edu.gh",
    faultResourceId: null,
    items: [
      { resourceAssetCode: "TLS-001", quantityRequested: 2, unit: "sets" }
    ],
    reason:
      "Two extra tool kits for the IT block walk-through inspection " +
      "next week — current kit is shared with the workshop team.",
    status: "approved",
    approvedByEmail: "demo.stores@gimpa.edu.gh",
    approverNotes: "Approved — kits on hand.",
    minutesAgo: 240,
    approvedMinutesAgo: 90
  },
  {
    // FULFILLED — older admin-side request fully closed.
    requesterEmail: "demo.maintadmin@gimpa.edu.gh",
    faultResourceId: null,
    items: [
      { resourceAssetCode: "OSS-001", quantityRequested: 10, unit: "boxes" }
    ],
    reason:
      "Replenish the office paper stock for the maintenance admin " +
      "office — current ream is almost out.",
    status: "fulfilled",
    approvedByEmail: "demo.stores@gimpa.edu.gh",
    approverNotes: "Approved.",
    fulfilledByEmail: "demo.stores@gimpa.edu.gh",
    quantitiesIssued: [10],
    minutesAgo: 60 * 24 * 3,         // 3 days ago
    approvedMinutesAgo: 60 * 24 * 3 - 30,
    fulfilledMinutesAgo: 60 * 24 * 2 // ~1 day later
  }
];

// Pull resource name + category by assetCode for the denormalized
// fields. Tolerant of missing entries so a seed with --skip-auth (no
// resources) still shows a clean error rather than crashing.
const findDemoResource = (assetCode) =>
  DEMO_RESOURCES.find((r) => r.assetCode === assetCode) || null;

const seedSupplyRequests = async (accountsByEmail, faultIdByResource) => {

  let written = 0;

  const tsAgo = (minutesAgo) =>
    admin.firestore.Timestamp.fromMillis(
      adminNow() - minutesAgo * 60 * 1000
    );

  for (const r of DEMO_SUPPLY_REQUESTS) {

    const requester = accountsByEmail[r.requesterEmail];
    if (!requester) {
      console.warn(
        `  ! skipping supply request: requester ${r.requesterEmail} ` +
        `not found in seeded accounts`
      );
      continue;
    }

    // Build items array with denormalized resource name + unit, mirroring
    // what createSupplyRequest.js writes from the live client.
    const items = r.items.map((it, idx) => {
      const res = findDemoResource(it.resourceAssetCode);
      const quantityIssued = r.status === "fulfilled"
        ? (r.quantitiesIssued?.[idx] ?? it.quantityRequested)
        : null;
      return {
        resourceId: it.resourceAssetCode,
        resourceName: res?.resourceName || it.resourceAssetCode,
        quantityRequested: it.quantityRequested,
        quantityIssued,
        unit: it.unit || "pieces"
      };
    });

    const requesterActor = {
      uid: requester.uid,
      name: requester.fullName,
      role: requester.userDoc.role
    };

    const approver = r.approvedByEmail
      ? accountsByEmail[r.approvedByEmail]
      : null;
    const approverActor = approver
      ? { uid: approver.uid, name: approver.fullName, role: approver.userDoc.role }
      : null;

    const fulfiller = r.fulfilledByEmail
      ? accountsByEmail[r.fulfilledByEmail]
      : null;
    const fulfillerActor = fulfiller
      ? { uid: fulfiller.uid, name: fulfiller.fullName, role: fulfiller.userDoc.role }
      : null;

    // Optional fault link — resolved from the in-memory map seedFaults
    // built up earlier.
    const linkedFaultId = r.faultResourceId
      ? (faultIdByResource[r.faultResourceId] || null)
      : null;
    const linkedFaultResource = r.faultResourceId
      ? findDemoResource(r.faultResourceId)
      : null;

    const requestRef = db.collection("supplyRequests").doc();

    const createdAtTs = tsAgo(r.minutesAgo);
    const approvedAtTs = r.approvedMinutesAgo != null
      ? tsAgo(r.approvedMinutesAgo)
      : null;
    const fulfilledAtTs = r.fulfilledMinutesAgo != null
      ? tsAgo(r.fulfilledMinutesAgo)
      : null;

    const payload = {
      relatedFaultId: linkedFaultId,
      relatedResourceId: r.faultResourceId || null,
      relatedResourceName: linkedFaultResource?.resourceName || null,

      items,
      reason: r.reason,

      requesterId: requester.uid,
      requesterName: requester.fullName,
      requesterRole: requester.userDoc.role,

      status: r.status,
      routedToRoles: ["Stores/Inventory Officer", "super_admin"],

      approvedBy: approverActor,
      approvedAt: approvedAtTs,
      approverNotes: r.approverNotes || null,

      deniedAt: null,
      deniedBy: null,
      denialReason: null,

      fulfilledAt: fulfilledAtTs,
      fulfilledBy: fulfillerActor,

      cancelledAt: null,
      cancelledBy: null,

      createdAt: createdAtTs,
      updatedAt: fulfilledAtTs || approvedAtTs || createdAtTs
    };

    // Build the statusHistory entries that mirror the request's
    // observed lifecycle. Each entry is written with a timestamp
    // matching the parent fields so the audit trail reads naturally.
    const historyEntries = [
      {
        changedAt: createdAtTs,
        oldStatus: null,
        newStatus: "pending",
        notes: "Supply request submitted",
        changedBy: requesterActor
      }
    ];

    if (r.status === "approved" || r.status === "fulfilled") {
      historyEntries.push({
        changedAt: approvedAtTs,
        oldStatus: "pending",
        newStatus: "approved",
        notes: r.approverNotes || "",
        changedBy: approverActor || requesterActor
      });
    }

    if (r.status === "fulfilled") {
      historyEntries.push({
        changedAt: fulfilledAtTs,
        oldStatus: "approved",
        newStatus: "fulfilled",
        notes: "",
        changedBy: fulfillerActor || requesterActor
      });
    }

    const batch = db.batch();
    batch.set(requestRef, payload);
    for (const entry of historyEntries) {
      const eref = requestRef.collection("statusHistory").doc();
      batch.set(eref, entry);
    }
    await batch.commit();

    written++;
  }

  return written;
};

// Date.now() shim — the rest of the script reads admin.firestore.* but
// the supplyRequest seeder needs a wall-clock reference for tsAgo. The
// `now` const inside seedFaults is local to that function, so we
// expose a stable helper here.
function adminNow() {
  return Date.now();
}

// ---------------------------------------------------------------
// 8. Main.
// ---------------------------------------------------------------

(async () => {

  if (!FORCE) {
    const answer = await askConfirm();
    if (answer !== "YES") {
      console.error("Aborted (confirmation not given).");
      process.exit(1);
    }
  } else {
    console.warn("--force given: skipping confirmation prompt.");
  }

  console.log("\nWiping existing data...");
  const wipedSupplyRequests = await wipeSupplyRequestsCollection();
  const wipedFaults = await wipeFaultsCollection();
  const wipedBookings = await wipeBookingsCollection();
  const wipedResources = await wipeResourcesCollection();
  const wipedUsers = await wipeUsersExceptSuperAdmin();
  console.log(
    `Wiped ${wipedSupplyRequests} supply requests, ${wipedFaults} faults, ` +
    `${wipedBookings} bookings, ${wipedResources} resources, ${wipedUsers} users.`
  );

  let seededAccounts = [];

  if (SKIP_AUTH) {
    console.log("\n--skip-auth given: skipping Auth account creation.");
    console.log(
      "Bookings will be skipped too — they depend on demo account uids.\n" +
      "Re-run without --skip-auth to seed bookings."
    );

    console.log("\nSeeding resources (no custodian assignments — auth was skipped)...");
    // Without seeded demo accounts the resources still get created,
    // but custodianId / changedBy fall back to "system" placeholders.
    const skipAuthActor = { uid: "system", name: "System (seed)", role: "super_admin" };
    const resourceCount = await seedResources({}, skipAuthActor);
    console.log(`Seeded ${resourceCount} resources.`);

    printSummary({
      accounts: [],
      resourceCount,
      bookingCount: 0,
      skipAuth: true
    });

    process.exit(0);
  }

  console.log("\nSeeding demo Auth accounts + user docs...");
  for (const acc of DEMO_ACCOUNTS) {
    const created = await createDemoAccount(acc);
    console.log(`  ✓ ${created.email}  (${created.userDoc.role})`);
    seededAccounts.push(created);
  }

  const accountsByEmail = Object.fromEntries(
    seededAccounts.map((a) => [a.email, a])
  );

  // Resolve the super-admin uid for history changedBy. The super-admin
  // is preserved through wipes (not in DEMO_ACCOUNTS) so we look them
  // up via Auth.
  let superAdminActor = { uid: "system", name: "System (seed)", role: "super_admin" };
  try {
    const superAdmin = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
    superAdminActor = {
      uid: superAdmin.uid,
      name: superAdmin.displayName || SUPER_ADMIN_EMAIL,
      role: "super_admin"
    };
  } catch (_) {
    console.warn(
      `Could not resolve super-admin (${SUPER_ADMIN_EMAIL}) — ` +
      `history entries will use a placeholder actor.`
    );
  }

  console.log("\nSeeding resources...");
  const resourceCount = await seedResources(accountsByEmail, superAdminActor);
  console.log(`Seeded ${resourceCount} resources.`);

  console.log("\nSeeding transfers...");
  const transferCount = await seedTransfers(accountsByEmail);
  console.log(`Seeded ${transferCount} transfers.`);

  console.log("\nSeeding bookings...");
  const bookingCount = await seedBookings(accountsByEmail);
  console.log(`Seeded ${bookingCount} bookings (including 1 with chat thread).`);

  console.log("\nSeeding faults...");
  const { written: faultCount, faultIdByResource } =
    await seedFaults(accountsByEmail);
  console.log(`Seeded ${faultCount} faults (1 with placeholder image).`);

  console.log("\nSeeding supply requests...");
  const supplyRequestCount =
    await seedSupplyRequests(accountsByEmail, faultIdByResource);
  console.log(`Seeded ${supplyRequestCount} supply requests.`);

  printSummary({
    accounts: seededAccounts,
    resourceCount,
    transferCount,
    bookingCount,
    faultCount,
    supplyRequestCount,
    skipAuth: false
  });

  process.exit(0);

})().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});

function printSummary({ accounts, resourceCount, transferCount, bookingCount, faultCount, supplyRequestCount, skipAuth }) {
  console.log("\n=====================================");
  console.log("Demo data ready.");
  console.log("=====================================\n");

  if (!skipAuth) {
    console.log(`All demo accounts use password: ${DEMO_PASSWORD}\n`);
    for (const a of accounts) {
      console.log(`  ${a.userDoc.role.padEnd(28)}${a.email}`);
    }
    console.log("");
  }

  console.log(`Resources seeded:  ${resourceCount}`);
  if (transferCount != null) {
    console.log(`Transfers seeded:  ${transferCount}`);
  }
  console.log(`Bookings seeded:   ${bookingCount}`);
  if (faultCount != null) {
    console.log(`Faults seeded:     ${faultCount}`);
  }
  if (supplyRequestCount != null) {
    console.log(`Supply requests:   ${supplyRequestCount}`);
  }
  console.log(`Super-admin preserved: ${SUPER_ADMIN_EMAIL}`);
  console.log("\nDone. Database ready for demo.\n");
}
