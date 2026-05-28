# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The actual Next.js project lives in the `gimpa-resource-mgt-main/` subfolder, not at the repo root. All `npm` commands must be run from inside that folder.

```
gimpa-smart-resource-mgt/         <- git root
└── gimpa-resource-mgt-main/      <- Next.js project (cd here before running npm)
```

## Commands

Run from `gimpa-resource-mgt-main/`:

- `npm run dev` — start the Next.js dev server on http://localhost:3000 (uses `--webpack` flag, not Turbopack)
- `npm run build` — production build (also `--webpack`)
- `npm run start` — serve the production build
- `npm run lint` — `next lint` (note: ESLint errors are **ignored during builds** per `next.config.mjs`, so lint must be run explicitly)

There is no test suite configured.

## High-level architecture

This is a Next.js 16 / React 19 App Router app (JavaScript, not TypeScript) backed by Firebase Auth + Cloud Firestore. It is a resource-booking and admin-approval system for GIMPA. There is no custom backend — the client talks to Firestore directly, so all access control depends on (a) UI gating by role and (b) Firestore security rules (not in this repo).

### Path alias

`@/*` resolves to `src/*` (configured in `jsconfig.json`). Use it for all internal imports.

### Two Firebase config files (gotcha)

There are two config files exporting different things. **Do not delete or "consolidate" them without checking imports first** — both are live:

- `src/firebase/config.js` — default export `app` (used by most of the codebase including signup, workspace, sidebar, booking)
- `src/firebaseConfig.js` — named exports `{ app, auth, db }` (used by the login page only, via dynamic import)

Both initialize the same Firebase project with `getApps().length === 0 ? initializeApp(...) : getApp()` to survive Next.js Fast Refresh.

### Routing & auth flow

- `/` → redirects to `/login`
- `/(auth)/login` and `/(auth)/signup` — public auth pages. The `(auth)` route group has no layout of its own; the root `layout.js` (which wraps everything in `ThemeProvider`) still applies.
- `/awaiting-approval` — landing page for users whose Firestore doc has `approved: false`
- `/workspace` — main authenticated app. `workspace/page.jsx` is the gatekeeper: it calls `onAuthStateChanged`, fetches the user's Firestore `users/{uid}` doc, and redirects to `/login` (no auth or no doc) or `/awaiting-approval` (doc exists but `approved` is false) before rendering anything.

The workspace page itself does not use Next.js nested routing for its tabs — it holds `activeSidebar` and `activeTab` state and conditionally renders panels (`CampusResource`, `Approvals`, `Users`, etc.). Adding a new top-level feature usually means: (1) add it to the `features` array in `src/app/components/Sidebar.jsx`, (2) add a conditional render block in `src/app/workspace/page.jsx`.

### Role model

Roles are stored on the Firestore `users/{uid}` document in the `role` field. They are assigned at signup based on email domain and the user's RoleSelector choice:

- `@st.gimpa.edu.gh` → student; `role` is set to their `studentType` (e.g., `"General Student"`, `"Course Rep"`)
- `@gimpa.edu.gh` → staff; `role` is set to their `position` (e.g., `"Lecturer"`, `"IT Officer"`, `"Stores/Inventory Officer"`)
- A hardcoded super-admin email in `src/app/(auth)/signup/signupUser.js` gets `role: "super_admin"` and is auto-approved.

The list of roles that require admin approval is `approvalRequiredRoles` inside `signupUser.js`. Anyone whose final role is in that list gets `approved: false, needsApproval: true` and is queued in the admin dashboard.

**The pending-approvals queue is partitioned by reviewer role** (`src/app/workspace/admin-dashboard/PendingApprovals.jsx`):
- `Secretariat Admin` sees only faculty-side pending users (Course Rep, Lecturer, Teaching Assistant, Secretariat Admin)
- `IT Officer` sees everyone else pending
- `super_admin` presumably sees the unfiltered list (no filter branch).

Sidebar visibility for the Admin Dashboard tab is gated by `adminRoles = ["super_admin", "Secretariat Admin", "IT Officer"]` in `Sidebar.jsx`.

### Booking routing

`src/app/workspace/resource-management/services/` contains the booking-routing logic (the only real "business logic" in the app):

- `permissions.js` — declares `departmentRoles`, `cannotBookRoles`, `operationalApprovers`, `globalApprovers`. Edit this file to change who can book or approve what.
- `getBookingRecipients.js` — pure function that, given a requester's role + department, returns `{ approvalRoute, targetRoles, department }`. Department roles (Course Rep, Lecturer, TA) route through their department's Secretariat Admin + global approvers; everyone else routes to operational approvers (Facility/Estate, Stores/Inventory, Receptionist) + global approvers.
- `createBooking.js` — composes the routing result into the Firestore `bookings` document. The `visibleToRoles` and `visibleToDepartment` fields are how queue UIs decide what each approver sees, so any Firestore security rules must enforce the same shape.

### Resource asset codes

`AddResourceForm.jsx` generates asset codes of the form `GIMPA-{categoryCode}-{typeCode}-{sequence}` by querying existing resources of the same category+type and incrementing the max sequence number. This is **read-then-write without a transaction**, so concurrent inserts can collide on the same code — keep that in mind if duplicates show up. `assetCode` is also used as the Firestore document ID (`setDoc(doc(db, "resources", assetCode), ...)`).

### Theme

`src/app/context/ThemeContext.jsx` provides a light/dark toggle by mutating CSS variables on `document.documentElement` and persisting to `localStorage`. CSS files under `src/app/styles/` read those variables. There is no Tailwind — styling is plain CSS, one file per feature, imported directly from the component.

### Deployment

`firebase.json` configures Firebase Hosting with `frameworksBackend.region: europe-west1` (App Hosting / framework-aware deploy). There is no `.firebaserc` checked in here.

## Notable conventions

- All interactive components use `"use client"`. The only server components are `layout.js`, the root `page.js` redirect, and `awaiting-approval/page.jsx`.
- Components use `.jsx`; non-React JS modules use `.js`.
- `next.config.mjs` sets `eslint.ignoreDuringBuilds: true` — builds will not fail on lint errors. Run `npm run lint` separately if you want lint feedback.
- The Firebase web API key is committed in the config files. That's expected for Firebase client config (the key identifies the project, not a secret), but data security depends entirely on Firestore rules, which are not in this repo.
