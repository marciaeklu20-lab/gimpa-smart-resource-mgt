# Demo data reset

A single command to wipe Firestore back to a known state and seed a
polished dataset for an investor / booth demo.

## What it does

1. **Wipes** every doc in `bookings` (including each booking's
   `/messages` subcollection), every doc in `resources`, and every doc
   in `users` **except the super-admin**
   (`marcia.ea.geal@gmail.com`).
2. **Recreates four demo Auth accounts** + their Firestore user docs.
3. **Seeds 15 resources** spanning Facilities, Labs, Equipment, and
   Vehicles.
4. **Seeds ~9 bookings** in varied states (approved / pending /
   rejected, past + future dates) including:
   - one **pending lecturer booking for tomorrow afternoon** — the
     featured live approval flow,
   - one **student booking with a pre-seeded chat thread** that
     appears unread for approvers on login (drives the "real-time
     chat + unread notification" demo).

It is **safe to re-run**. Resources are upserted by deterministic
asset codes; demo Auth accounts are deleted and recreated cleanly.

## Demo account credentials

All four use the same password: **`demo1234`**.

| Role | Email |
|---|---|
| `student` (General Student) | `demo.student@st.gimpa.edu.gh` |
| `Lecturer` | `demo.lecturer@gimpa.edu.gh` |
| `Secretariat Admin` | `demo.secretariat@gimpa.edu.gh` |
| `Facility/Estate Officer` | `demo.facility@gimpa.edu.gh` |

The super-admin (`marcia.ea.geal@gmail.com`) survives the wipe with
whatever password it had.

## How to run

### 1. Provide Admin SDK credentials

The script uses the **Firebase Admin SDK** (bypasses Firestore rules
so the wipe can run). Provide credentials in one of two ways:

- Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a service
  account JSON, **OR**
- Drop the service account JSON at
  `gimpa-resource-mgt-main/scripts/serviceAccount.json` (gitignored
  by `scripts/.gitignore`).

Generate the JSON in the Firebase console: **Project settings →
Service accounts → Generate new private key**.

### 2. Run it

From `gimpa-resource-mgt-main/`:

```sh
# Interactive (prompts "Type YES to confirm:")
node scripts/seedDemoData.js

# Non-interactive — for the morning of the demo
node scripts/seedDemoData.js --force

# Skip Auth-account recreation (useful if Firebase Auth quota is tight)
node scripts/seedDemoData.js --force --skip-auth
```

The script will print a credentials block at the end summarising what
to use to log in.

## Safety

- Hardcoded **project ID guard**: the script aborts unless the
  credentials point at `gimpa-resource-mgt`. Don't bypass this — it's
  the only safeguard against pointing at a wrong project.
- The super-admin doc is never touched.
- `seedBookings.js` (the analytics-charts seeder) is **not** affected
  by this script — they live side by side.

## Featured demo flows

- **Live approval** — log in as `demo.secretariat@gimpa.edu.gh`; the
  pending lecturer booking for tomorrow afternoon is the one to
  approve on stage.
- **Real-time chat + unread badge** — log in as
  `demo.secretariat@gimpa.edu.gh` (or `demo.facility@gimpa.edu.gh`);
  the student's Conference Room B booking shows a `NEW` badge with
  four pre-seeded messages waiting. Open it, reply, and the student
  side (`demo.student@st.gimpa.edu.gh` in another window) sees the
  reply live.
- **Analytics** — already populated by the pre-existing
  `seedBookings.js` if you've run it; this script's ~9 bookings
  contribute additional approved / rejected / pending data points.
