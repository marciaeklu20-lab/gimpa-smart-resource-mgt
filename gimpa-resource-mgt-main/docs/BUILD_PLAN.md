# Master Build Plan — GIMPA Smart Resource Management System

This plan implements the full feature set (proposal + roadmap) in **safe, staged
order**. The non-negotiable rule:

> **After every stage, the build MUST pass and you MUST commit.**
> Never start a stage you cannot finish and commit. A working app at Stage 2
> beats a broken app reaching for Stage 5.

Stages are ordered: free + core first, billing-gated next, API-key-gated last.
Tags: **[FREE]** = no card needed · **[BLAZE]** = needs Firebase billing card ·
**[API KEY]** = needs a paid/free-tier LLM API key.

---

## Rules for Claude Code (read before starting)
- Work on a branch, not main: `git checkout -b feature/full-build`.
- Do ONE stage at a time. Run `npm run build` at the end of each stage.
- If the build fails, FIX it before moving on. Do not proceed on a red build.
- Commit after each green stage with a clear message.
- Before any large change, explain the approach in 2–3 sentences so I can learn it.
- **Skip any [BLAZE] or [API KEY] task if the prerequisite isn't set up.** Do not
  thrash trying to make it work — instead, print a one-line note telling me what
  I need to enable, and move on.
- Keep diffs small and reviewable. No mass rewrites.

---

## Stage 0 — Baseline [FREE]
1. `git checkout -b feature/full-build`
2. Run `npm run build`; record the current errors.
3. Commit the starting point so we have a clean fallback.

## Stage 1 — Make it build & run (MUST-HAVE) [FREE]
1. Create `services/fetchBookings.js`, `services/approveBooking.js`,
   `services/rejectBooking.js` matching the schema written by `createBooking.js`.
2. Create the missing `booking-table.css`.
3. Add the render branch in `workspace/page.jsx` for Resource Management > Bookings.
4. Consolidate the duplicate Firebase config (`firebaseConfig.js` vs
   `firebase/config.js`) into ONE file; update all imports.
5. Remove the unrecognized `eslint` key in `next.config.mjs`.
6. `npm run build` must pass. **Commit.**

## Stage 2 — Correctness & security (MUST-HAVE) [FREE]
1. Fix the `@gmail.com` login bypass in `login/page.jsx`.
2. Consolidate the department list into one shared module; fix the `"Scool"`
   typo; enforce that department-bound roles must have a department at signup.
3. Make signup atomic: if the Firestore write fails, delete the just-created
   Auth user, then rethrow.
4. **Add conflict / double-booking detection** to `createBooking.js`: before
   writing, query existing bookings for the same `resourceId` with overlapping
   `startDate`/`endDate`; block with a clear message if one exists.
   (This is proposal objective 3.2 #2 — do not skip it.)
5. Add `firestore.rules` to the repo (mirroring the console rules) and wire it
   into `firebase.json`.
6. Implement a real logout button and surface it in the header.
7. `npm run build` must pass. **Commit.**

> ✅ If you stop here, you have a complete, secure, defensible system:
> signup → role-based access → resource management → booking request →
> approval → conflict prevention, with enforced security. Everything below is bonus.

## Stage 3 — Free feature wins (HIGH VALUE, no billing) [FREE]
Do these one at a time, committing after each.
1. **Analytics dashboard** (admin-only, under the Analytics tab): read all
   bookings once; chart bookings-per-resource, per-department, per-status, and
   per-day-of-week, plus a KPI summary row. Add `recharts`. Then provide a
   script to seed ~20 sample bookings so the charts have data.
2. **Chat / communication (FREE, Firestore real-time).** Two parts — do them
   in this order:
   - **Contextual threads (do first, lower complexity):** a `messages`
     subcollection on each booking (requester ↔ approver). The same pattern is
     reused on fault reports in Stage 4.
   - **General stakeholder messaging — MINIMUM VIABLE ONLY (bonus, do last):**
     wire the existing dead "Chat" sidebar tab to a real screen. Scope = 1:1
     direct messages (a `conversations` collection holding two participant IDs,
     each with a `messages` subcollection) plus optional role/department group
     channels. Do NOT build presence, read-receipts, blocking, or search.
     Attempt only after the must-haves AND the analytics dashboard are done and
     committed.
3. **Resource state machine**: replace ad-hoc status strings with a clear set
   (`available / booked / in_use / under_maintenance / retired`).
4. **Audit log**: write a timestamped record to an `auditLogs` collection on
   every booking create / approve / reject / status change.
5. **Rules-based smart recommendation** (no API needed): when a requested
   resource is unavailable, suggest the closest available one by capacity/type.
6. *(Optional if time):* QR code per resource; iCal/calendar export.
7. `npm run build` after each; **commit** after each.

## Stage 4 — Billing-gated features [BLAZE — needs a billing card]
> Prerequisite: upgrade the Firebase project to the Blaze plan (links a card;
> stays ~$0 at your scale). If you have NOT done this, skip this whole stage —
> these will error with 402/403 otherwise.
1. **Fault reporting (text-only part is FREE):** a `faults` collection + a
   "Report Issue" entry point + a Maintenance dashboard branch. Include a
   per-fault comment thread (reporter ↔ maintenance) reusing the contextual-chat
   pattern from Stage 3. The *image upload* part needs Storage = Blaze; build the
   text-only version first, add images only if Blaze is enabled.
2. **Student ID upload** to Firebase Storage at signup (Blaze).
3. **Check-in + auto-release:** add the booking lifecycle and a Check-In button.
   - FREE fallback: release expired/no-show bookings lazily when an admin or user
     loads the bookings view (no Cloud Function needed).
   - BLAZE version: a scheduled Cloud Function that auto-releases after the grace
     window. Only build this if Blaze is enabled.
4. **In-app notifications (FREE) vs push (BLAZE):**
   - FREE: a `notifications` collection + a bell icon reading it in real time.
   - BLAZE: FCM push triggered by a Cloud Function. Only if Blaze is enabled.
5. `npm run build`; **commit.**

## Stage 5 — AI features [API KEY — needs an LLM API key]
> Prerequisite: an LLM API key (Google Gemini has a free tier that may suffice;
> Anthropic/OpenAI are paid). If you have NO key, skip this stage.
1. **Natural-language booking assistant:** an input where a user types
   "book a lab for 20 people tomorrow 2pm"; the model parses intent, your code
   checks Firestore availability, and proposes options.
2. **Conversational analytics for admins:** plain-English questions answered from
   the bookings data.
3. `npm run build`; **commit.**

## Stage 6 — Hygiene [FREE]
1. Rewrite `README.md` to describe the project, stack, and how to run it.
2. Add a proper `.gitignore` (node_modules, .next, .env*.local).
3. Delete the leftover `210.png` binary.
4. Add `.env.example` and move Firebase config to env vars.
5. Write `docs/SCHEMA.md` documenting the `users`, `resources`, `bookings`,
   `faults`, `messages`, `auditLogs`, `notifications` fields.
6. Add one test for the pure `getBookingRecipients` function.
7. `npm run build`; **commit.** Then merge the branch into main.

---

## Future Work — deferred backlog (NOT scheduled; pick up after Stages 1–3)
These are intentionally parked so they aren't lost. Do not attempt them until the
core (Stages 1–3) is built and committed. Tags as above:
**[FREE]** · **[BLAZE]** · **[API KEY]**. (Note: the per-fault chat thread is NOT
here — it's already scheduled inside Stage 4.)

### Proposal features deferred (defend these as deliberate Future Work)
- **Reputation / reliability scoring (§6.9)** [FREE] — add `reputationScore` to
  the user doc; decrement on `no_show`; gate booking creation by a threshold;
  give admins an override UI.
- **Academic integration & faculty priority (§6.4)** [FREE for manual] — add a
  `priority` flag so academic/official bookings outrank general ones; later, sync
  an academic timetable (a `timetable` collection an admin populates) and check
  overlap before allowing a booking. Full ERP/portal sync = longer-term.
- **Resource depreciation tracking (§6.3)** [FREE] — extend the resource doc with
  purchase date/value and service count; compute depreciation; surface it in the
  maintenance view alongside the condition log.
- **Bot assistant for quick availability (§6.6)** — "Is Lab 2 free at 2pm?" Two
  routes: a rule-based availability bot [FREE, no API needed], or via the Stage 5
  natural-language assistant [API KEY]. Start rule-based.
- **Live admin control center / real-time campus-wide status (§6.10)** [FREE] — a
  live board showing every resource's current state (available / in_use /
  under_maintenance) using Firestore real-time listeners; extends the analytics
  dashboard from a reporting view into an operational one.
- **Pre-session reminders (§10.2)** — remind a user before their booking starts.
  In-app reminder [FREE]; push reminder needs FCM + a scheduled function [BLAZE].

### Suggested enhancements deferred (pure bonus)
- **Recurring bookings** and **waitlist with auto-offer** on cancellation/no-show [FREE]
- **Configurable policy engine** — admin-set usage quotas, advance-booking window,
  blackout dates, turnover buffers between bookings [FREE]
- **Location hierarchy** — campus → building → floor → room [FREE]
- **Threshold alerts** (maintenance overdue, utilization spikes) and **bulk CSV
  import** of resources [FREE]
- **Demand forecasting**, **no-show prediction**, **ML-based recommendation** —
  need accumulated historical data first; genuine longer-term work [API KEY / data]
- **AI fault triage** — classify severity/type from an uploaded photo [API KEY + BLAZE]

---

## Reality note
Stages 1–2 are the must-haves and are fully free. Stage 3 is the best free
bonus and the most demoable — within it, do the **contextual chat** (cheap,
core) before the **general messenger** (bigger, bonus). Stages 4–5 depend on
billing / API access and are realistically *future work* unless those are set
up. Implement in order, commit relentlessly, and you'll always have something
that works.
