/**
 * Stage 5 — seed the four fixed chat channels.
 *
 * Idempotent: each channel is upserted by a STABLE document id
 * (= channelKey), so re-running only refreshes name/description/
 * allowedRoles and never creates duplicates. Message summary fields are
 * set on first create only (merge:true preserves them on re-runs).
 *
 * Run from the repo ROOT (gimpa-smart-resource-mgt/):
 *   NODE_PATH=gimpa-resource-mgt-main/functions/node_modules \
 *     node scripts/backfillChatChannels.js
 *
 * NB: the allowedRoles lists here MUST stay in sync with
 * subscribeConversations.js (client visibility) and the firestore.rules
 * conversations read gate.
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "gimpa-resource-mgt" });

const db = admin.firestore();

const CHANNELS = [
  {
    channelKey: "general",
    name: "General",
    description: "Open to all approved users.",
    // Sentinel rather than [] : the channels LIST query filters on
    // allowedRoles (array-contains-any [role, "__all_approved__"]) so the
    // security rule can prove readability from the query alone. An empty
    // array can't be matched by array-contains-any, so "open to all" needs
    // a concrete member every approved user's query includes.
    allowedRoles: ["__all_approved__"]
  },
  {
    channelKey: "admins",
    name: "Admins",
    description: "Platform admins coordination.",
    allowedRoles: ["super_admin", "Secretariat Admin", "IT Officer"]
  },
  {
    channelKey: "maintenance",
    name: "Maintenance",
    description: "Maintenance team channel.",
    // Stage 6: super_admin removed — operationally separated from the
    // maintenance domain. (Reseed pending; billing-blocked.)
    allowedRoles: ["Maintenance Admin", "Maintenance Staff"]
  },
  {
    channelKey: "lecturers",
    name: "Lecturers",
    description: "Academic staff channel.",
    allowedRoles: ["super_admin", "Lecturer"]
  }
];

async function run() {
  let created = 0;
  let updated = 0;

  for (const ch of CHANNELS) {
    const ref = db.collection("conversations").doc(ch.channelKey);
    const snap = await ref.get();

    const base = {
      type: "channel",
      channelKey: ch.channelKey,
      name: ch.name,
      description: ch.description,
      allowedRoles: ch.allowedRoles
    };

    if (snap.exists) {
      await ref.set(base, { merge: true });
      updated++;
      console.log(`  updated channel: ${ch.channelKey}`);
    } else {
      await ref.set({
        ...base,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageSenderId: null,
        lastMessageSenderName: null
      });
      created++;
      console.log(`  created channel: ${ch.channelKey}`);
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
