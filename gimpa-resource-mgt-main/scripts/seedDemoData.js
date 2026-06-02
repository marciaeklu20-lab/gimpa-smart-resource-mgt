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
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
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

const DEMO_RESOURCES = [
  // Facilities
  {
    assetCode: "FAC-001",
    resourceName: "Main Auditorium",
    category: "Facilities",
    type: "Auditoriums",
    description: "Large auditorium suited for keynote talks and ceremonies.",
    capacity: "500"
  },
  {
    assetCode: "FAC-002",
    resourceName: "Conference Room A",
    category: "Facilities",
    type: "Conference Rooms",
    description: "Mid-size boardroom with conferencing AV.",
    capacity: "30"
  },
  {
    assetCode: "FAC-003",
    resourceName: "Conference Room B",
    category: "Facilities",
    type: "Conference Rooms",
    description: "Smaller meeting space for departmental sessions.",
    capacity: "16"
  },
  {
    assetCode: "FAC-004",
    resourceName: "Seminar Hall",
    category: "Facilities",
    type: "Halls",
    description: "Tiered seminar hall for workshops and trainings.",
    capacity: "120"
  },
  // Labs (sit under Facilities — the system has no separate Lab category)
  {
    assetCode: "LAB-001",
    resourceName: "Computer Lab 1",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Computer lab with 40 workstations.",
    capacity: "40"
  },
  {
    assetCode: "LAB-002",
    resourceName: "Computer Lab 2",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Computer lab with 36 workstations.",
    capacity: "36"
  },
  {
    assetCode: "LAB-003",
    resourceName: "Engineering Lab",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Lab with engineering benches and equipment.",
    capacity: "24"
  },
  {
    assetCode: "LAB-004",
    resourceName: "Lab Annex",
    category: "Facilities",
    type: "Lecture Halls",
    description: "Annex space for overflow lab sessions.",
    capacity: "20"
  },
  // Equipment
  {
    assetCode: "EQP-001",
    resourceName: "Projector A",
    category: "Electronics & Electrical Equipment",
    type: "Projectors",
    description: "4K projector with HDMI / wireless casting.",
    quantity: 1,
    capacity: ""
  },
  {
    assetCode: "EQP-002",
    resourceName: "Projector B",
    category: "Electronics & Electrical Equipment",
    type: "Projectors",
    description: "Backup projector for events.",
    quantity: 1,
    capacity: ""
  },
  {
    assetCode: "EQP-003",
    resourceName: "Sound System",
    category: "Electronics & Electrical Equipment",
    type: "AV Systems(e.g.,Speakers)",
    description: "Powered PA + wireless mics.",
    quantity: 1,
    capacity: ""
  },
  {
    assetCode: "EQP-004",
    resourceName: "Camera Kit",
    category: "Electronics & Electrical Equipment",
    type: "AV Systems(e.g.,Speakers)",
    description: "DSLR + tripod + lighting for event capture.",
    quantity: 1,
    capacity: ""
  },
  // Vehicles
  {
    assetCode: "VEH-001",
    resourceName: "University Bus",
    category: "Vehicles & Transport",
    type: "Buses",
    description: "32-seater university shuttle bus.",
    quantity: 1,
    capacity: "32"
  },
  {
    assetCode: "VEH-002",
    resourceName: "Sedan-01",
    category: "Vehicles & Transport",
    type: "Cars",
    description: "Executive sedan for official trips.",
    quantity: 1,
    capacity: "4"
  },
  {
    assetCode: "VEH-003",
    resourceName: "Pickup Truck",
    category: "Vehicles & Transport",
    type: "Vans",
    description: "Pickup for equipment transport.",
    quantity: 1,
    capacity: "3"
  }
];

const seedResources = async () => {
  for (const r of DEMO_RESOURCES) {
    await db.collection("resources").doc(r.assetCode).set({
      assetCode: r.assetCode,
      resourceName: r.resourceName,
      category: r.category,
      type: r.type,
      description: r.description || "",
      // Mirrors AddResourceForm.jsx: Facilities don't carry a quantity.
      quantity: r.category === "Facilities" ? null : (r.quantity ?? 1),
      capacity: r.capacity || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return DEMO_RESOURCES.length;
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

    requesterId: requester.uid,
    requesterName: requester.fullName,
    requesterEmail: requester.email,
    requesterRole: requester.role,
    requesterDepartment: requester.department ?? null,

    approvalRoute: routing.approvalRoute,
    visibleToRoles: routing.visibleToRoles,
    visibleToDepartment: routing.visibleToDepartment,

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
  const wipedBookings = await wipeBookingsCollection();
  const wipedResources = await wipeResourcesCollection();
  const wipedUsers = await wipeUsersExceptSuperAdmin();
  console.log(
    `Wiped ${wipedBookings} bookings, ${wipedResources} resources, ${wipedUsers} users.`
  );

  let seededAccounts = [];

  if (SKIP_AUTH) {
    console.log("\n--skip-auth given: skipping Auth account creation.");
    console.log(
      "Bookings will be skipped too — they depend on demo account uids.\n" +
      "Re-run without --skip-auth to seed bookings."
    );

    console.log("\nSeeding resources...");
    const resourceCount = await seedResources();
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

  console.log("\nSeeding resources...");
  const resourceCount = await seedResources();
  console.log(`Seeded ${resourceCount} resources.`);

  console.log("\nSeeding bookings...");
  const accountsByEmail = Object.fromEntries(
    seededAccounts.map((a) => [a.email, a])
  );
  const bookingCount = await seedBookings(accountsByEmail);
  console.log(`Seeded ${bookingCount} bookings (including 1 with chat thread).`);

  printSummary({
    accounts: seededAccounts,
    resourceCount,
    bookingCount,
    skipAuth: false
  });

  process.exit(0);

})().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});

function printSummary({ accounts, resourceCount, bookingCount, skipAuth }) {
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
  console.log(`Bookings seeded:   ${bookingCount}`);
  console.log(`Super-admin preserved: ${SUPER_ADMIN_EMAIL}`);
  console.log("\nDone. Database ready for demo.\n");
}
