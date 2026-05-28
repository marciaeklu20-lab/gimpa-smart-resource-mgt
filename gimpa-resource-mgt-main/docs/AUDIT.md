# Project Audit

Date: 2026-05-28
Scope: `gimpa-resource-mgt-main/` (Next.js 16 / React 19 / Firebase)
Method: build + static read of every source file under `src/`.

---

## 1. Build status

`npm run build` (from `gimpa-resource-mgt-main/`) → **exit 0**. All 6 routes compile and prerender:
`/`, `/_not-found`, `/awaiting-approval`, `/login`, `/signup`, `/workspace`.

### Warnings emitted

| # | Source | Message | Impact |
|---|--------|---------|--------|
| W1 | Next 16 | `⚠ \`eslint\` configuration in next.config.mjs is no longer supported.` | The `eslint.ignoreDuringBuilds` key is silently dropped. Lint is currently still not run at build time (Next 16 ran no lint step), but the config no longer reflects reality. |
| W2 | Next 16 | `⚠ Invalid next.config.mjs options detected: Unrecognized key(s) in object: 'eslint'` | Same root cause as W1. Will need migration when Next reintroduces a build-time lint step. |
| W3 | `baseline-browser-mapping` | `The data in this module is over two months old.` (emitted ~6×) | Transitive dep; harmless, but noisy. Resolved by `npm i baseline-browser-mapping@latest -D`. |

### Errors

None. Build succeeds.

### What the build does *not* catch

Several `.jsx` files import modules that **do not exist** but are never reached from any route, so webpack never compiles them. They will crash the second they are imported. See B1 below.

---

## 2. Known issues from CLAUDE.md — still present?

CLAUDE.md does not have a dedicated "Known Issues" section; the items below are the explicit gotchas/caveats it calls out.

| # | CLAUDE.md claim | Status | Evidence |
|---|---|---|---|
| K1 | Two live Firebase config files (`src/firebase/config.js` default-exports `app`; `src/firebaseConfig.js` named-exports `{ app, auth, db }`). Login uses the second; everything else uses the first. | **Still present** | `src/firebase/config.js` (lines 16, 30), `src/firebaseConfig.js` (lines 19–26); login dynamic-imports it at `src/app/(auth)/login/page.jsx:49`. |
| K2 | `AddResourceForm` generates asset codes by read-then-write without a transaction — concurrent inserts can collide. `assetCode` is also the Firestore doc ID. | **Still present** | `src/app/workspace/resource-management/add-resource/AddResourceForm.jsx:131–178` (loose `getDocs` + `setDoc(doc(db,"resources",assetCode), …)` at line 189). |
| K3 | `next.config.mjs` sets `eslint.ignoreDuringBuilds: true`, so lint must be run separately. | **Status changed.** Config flag is still in the file (`next.config.mjs:4-6`) but Next 16 no longer recognises it (build warnings W1/W2). Lint is still not enforced at build time, but for a different reason: Next 16 dropped the integrated build-time lint step entirely. | `next.config.mjs:4–6`. |
| K4 | `PendingApprovals` queue is partitioned by reviewer role; Secretariat Admin sees faculty-side pending users; IT Officer sees the rest; super_admin "presumably" sees everyone (no filter branch). | **Still present, with caveat** | `src/app/workspace/admin-dashboard/PendingApprovals.jsx:53–59`. Confirmed: no `super_admin` branch — they fall through and see the unfiltered list. Any role not equal to `"Secretariat Admin"` or `"IT Officer"` does the same. |
| K5 | Sidebar `adminRoles = ["super_admin", "Secretariat Admin", "IT Officer"]` gates Admin Dashboard visibility. | **Still present** | `src/app/components/Sidebar.jsx:43`. |
| K6 | Workspace page is the gatekeeper: redirects to `/login` if not auth'd or no doc, to `/awaiting-approval` if `approved===false`. | **Still present** | `src/app/workspace/page.jsx:37–67`. |
| K7 | Booking-routing logic lives in `services/permissions.js`, `services/getBookingRecipients.js`, `services/createBooking.js`. Routing writes `visibleToRoles` and `visibleToDepartment` to the booking doc. | **Still present** | All three files exist and match description. |
| K8 | Path alias `@/*` → `src/*`. | **Still present** | `jsconfig.json` + all imports use the alias. |
| K9 | All interactive components use `"use client"`; only server components are `layout.js`, `page.js` (root redirect), and `awaiting-approval/page.jsx`. | **Still present** | Verified across all files. |
| K10 | Firebase web API key committed in config files. | **Still present, expected** | `src/firebase/config.js:6`, `src/firebaseConfig.js:10`. Acceptable for Firebase client config — but means all access control depends on Firestore rules, which are not in this repo (see B6). |

---

## 3. Proposal requirements vs actual code

Status legend: ✅ Implemented · 🟡 Partial · ❌ Missing.

### §6 Feature breakdown

| Feature | Status | Evidence / gap |
|---|---|---|
| 6.1 Unified Booking and Attendance | 🟡 | Booking creation works (`createBooking.js`, `BookingForm.jsx`). **No attendance/check-in capture at all.** No booking-state field for "Confirmed / In Use / Auto-Released". |
| 6.2 Real-Time Analytics and Dashboards | ❌ | Sidebar lists "Analytics" (`Sidebar.jsx:50`) but `workspace/page.jsx` has no render branch for it — clicking the item shows nothing. No charts, no aggregation queries. |
| 6.3 Resource Condition and Tracking | ❌ | `AddResourceForm` writes only `{assetCode, resourceName, category, type, description, quantity, capacity, createdAt}`. No condition field, no maintenance log, no depreciation tracking. |
| 6.4 Academic Integration | ❌ | No timetable model, no academic-priority logic. `Lecturer` is treated identically to `Course Rep` / `TA` in `permissions.js:1-5`. |
| 6.5 Secure Access Control | 🟡 | Firebase Auth wired and signup restricts to `@st.gimpa.edu.gh` / `@gimpa.edu.gh` (+ one hardcoded super-admin Gmail). **But login accepts any `@gmail.com` address as `"admin"`** — see B3. No check-in. No auto-release. |
| 6.6 Bot Assistant and Alerts | ❌ | Sidebar lists "AI Assistant" with no panel. No FCM, no WhatsApp/Telegram bridge, no notification code anywhere. |
| 6.7 Approval Workflow and Communication | 🟡 | **User-signup approval works end-to-end** (`PendingApprovals.jsx`, `Approvals.jsx`, `ApprovedUsers.jsx`). **Booking approval is half-built**: `createBooking` writes pending bookings with proper routing fields, but `BookingTable.jsx` / `BookingRequests.jsx` import three nonexistent files (see B1) and no UI renders them anyway (see B2). No embedded comment thread on bookings. |
| 6.8 Fault Reporting and Maintenance Logging | ❌ | Sidebar lists "Maintenance" with no panel. No fault model, no upload, no maintenance dashboard. |
| 6.9 Policy Enforcement and User Reputation System | ❌ | No reputation field on user doc, no quota enforcement, no policy table. |
| 6.10 Administrative Control Center | 🟡 | Admin Dashboard exists with Approvals + Users tabs. No real-time resource status, no booking activity, no reported-issues view. |

### §8 Technology stack

| Layer | Proposed | Present? |
|---|---|---|
| Next.js | ✅ | 16.0.0 (`package.json:14`) |
| Vanilla CSS | ✅ | `src/app/styles/**/*.css`, no Tailwind |
| Chart.js / D3.js | ❌ | Not in dependencies |
| Leaflet.js | ❌ | Not in dependencies |
| Firebase Cloud Functions | ❌ | No `functions/` directory, no scheduled jobs |
| Firebase Auth | 🟡 | Wired; domain filter only at signup (login is permissive) |
| Cloud Scheduler + Functions for auto-release | ❌ | Not implemented |
| Firestore | ✅ | Used for users, resources, bookings |
| Firebase Storage | ❌ | Signup form captures `idFile` (`signup/page.js:32, 244`) but **the file is never uploaded** — `signupUser.js` does not accept or persist it |
| Firebase Cloud Messaging | ❌ | Not wired |

### §9 User roles

| Role | Proposal expectation | Implemented? |
|---|---|---|
| Student | view, book, check-in, report faults, reputation-scored | 🟡 — `"General Student"` is in `cannotBookRoles` so they **cannot book at all** (`permissions.js:7-9`). Only `"Course Rep"` students can book. No check-in, no fault reporting. |
| Lecturer | book with academic priority, override availability, endorse dept bookings, see usage analytics | 🟡 — Can book via departmental route. No priority logic, no override, no analytics view. |
| Administrator | view all bookings, approve/reject/escalate, set policies, view analytics, manage reputation | 🟡 — Signup approval works. Booking approval UI not reachable. No policy config UI. No analytics. |
| Maintenance / Support Staff | receive fault alerts, update resource status, view maintenance history | ❌ — Role can be picked at signup (`RoleSelector.jsx:47` "Maintenance Officer") but no maintenance UI exists. |

### §10 Workflows

| Workflow | Status | Gap |
|---|---|---|
| 10.1 Booking Request and Approval | 🟡 | Request creation ✅. Approval UI ❌ (orphaned — see B1/B2). No clarification comments thread. |
| 10.2 Check-In with Reminder and Auto-Release | ❌ | Not implemented. |
| 10.3 Fault Reporting and Maintenance Escalation | ❌ | Not implemented. |
| 10.3.2 Role-Based Access Interaction Flow | 🟡 | Sidebar filters Admin Dashboard by role; otherwise all roles see the same tabs. |

---

## 4. Additional bugs / issues found (not in CLAUDE.md)

Numbered for cross-reference from BACKLOG.md.

- **B1. Missing booking-approval services.** `BookingTable.jsx:4-9` imports `./services/approveBooking` and `./services/rejectBooking`; `BookingRequests.jsx:21-22` imports `./services/fetchBookings`. **None of those files exist** in `services/` (only `createBooking.js`, `getBookingRecipients.js`, `permissions.js`). Currently invisible because nothing imports `BookingRequests` — but the moment it is wired up, the build will break.
- **B2. Dead "Bookings" tab.** `workspace/page.jsx:28` declares `resourceTabs = ["Campus Resources", "Bookings"]`. Clicking "Bookings" sets `activeTab` but there is no `{activeSidebar === "Resource Management" && activeTab === "Bookings"}` render block. The tab is a no-op.
- **B3. Login bypass via `@gmail.com`.** `src/app/(auth)/login/page.jsx:21-26` allows any `@gmail.com` email to authenticate as `"admin"`. The contradictory `||` in line 24 also means staff `@gimpa.edu.gh` emails always resolve to `"lecturer"`, never `"admin"`, regardless of the user's actual Firestore `role`. This local `roleFromEmail` value is *not used post-login* (the workspace gatekeeper re-reads the role from Firestore), so the practical impact is limited to letting any Gmail user attempt login — but they still get bounced if no `users/{uid}` doc exists. Bad either way: contradicts §6.5.
- **B4. Signup never uploads the student ID file.** `signup/page.js:32, 244` captures `idFile`; passes it to `signupUser({…, idFile})` at line 81; `signupUser.js:5-15` does not even destructure `idFile`. The upload widget is decorative.
- **B5. Empty file: `src/app/components/ProfileTrigger.jsx`** is 0 bytes. Nothing imports it currently, but it is presumably meant for the header's profile menu (no profile menu rendered today).
- **B6. No Firestore security rules in repo.** All access control rests on UI gating + (assumed) external rules. A signed-in `"General Student"` could still call `addDoc(collection(db, "bookings"), …)` directly from the browser and bypass `cannotBookRoles`. Same for resources, users, etc.
- **B7. Department list inconsistencies.** `RoleSelector.jsx:14-20` lists 5 departments including a typo `"Scool Of Technology And Social Sciences"`. `Users.jsx:86-94` lists *different* department names entirely (`"School of Technology"`, `"Law School"`, etc.). Filter in Users will never match anything created via signup.
- **B8. `BookingTable.jsx:11` imports `@/app/styles/resource-management/booking-table.css`** — that CSS file does **not** exist (`src/app/styles/resource-management/` contains only `booking-form.css` and `resource-list.css`). Build doesn't catch it because BookingTable isn't rendered.
- **B9. Sidebar dead tabs.** `Sidebar.jsx:46-51` lists `Dashboard`, `Chat`, `Maintenance`, `Analytics`, `AI Assistant` — none of them have a render branch in `workspace/page.jsx`. Clicking does nothing.
- **B10. `LogoutButton.jsx:6-9` has a stub `handleLogout` that only `console.log`s.** It does not call `signOut(auth)`. (Not currently rendered anywhere either.)
- **B11. `auth/email-already-in-use` leaks orphaned Firestore doc on signup failure.** In `signupUser.js`, if the Auth user creation succeeds but the Firestore `setDoc` throws (rules, network), the Auth account exists with no profile — and the user can never sign in again because `workspace/page.jsx:48` redirects them to `/login` on missing doc. No cleanup.
- **B12. Workspace gatekeeper race / no `app` dependency.** `workspace/page.jsx:37` uses `useEffect(() => { … }, [])`. `auth` and `firestore` are derived from `app` on every render but the effect only runs once — fine for the singleton, but `router` is not in the dep array either. Minor, but worth noting.
- **B13. `signupUser.js` always sends `staffID`/`position`/etc. as `null` for the opposite role.** Acceptable, but `RoleSelector` lets a staff user pick a "faculty" role that needs department, and `position` validation does not enforce department was actually set — `setDoc` happily writes `department: null`. Then the requester's bookings get `requesterDepartment: null` and `getBookingRecipients` returns `department: null` for the routing, so the booking ends up visible to "Secretariat Admin" *with no department filter*, defeating the department partitioning.
- **B14. `ApprovedUsers` Secretariat filter** at `ApprovedUsers.jsx:59-61` filters by `user.department === userDepartment`. Combined with B13, departments that are `null` will silently drop out of the Secretariat Admin's view.
- **B15. `next/font/google` (`Geist`, `Geist_Mono`) in `layout.js`** requires network access at build time. Build succeeded in this sandbox, so OK — but worth flagging for air-gapped builds.

---

## 5. Quick summary

- The build is green.
- The user-approval flow is the only end-to-end working "business" workflow.
- The booking-approval flow is half-built (creation works, no approval UI reaches the screen).
- Roughly two-thirds of the proposal — attendance/check-in, analytics, fault reporting, reputation, FCM, Cloud Functions, Storage, academic-timetable integration, bot — is **not started**.
- Several non-obvious bugs exist (B1, B3, B4, B7, B13) that should be fixed before any new feature work.
