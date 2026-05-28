# Prioritized Backlog

Derived from `docs/AUDIT.md`. Numbered in suggested execution order; each item is independently picky-uppable. Tier labels indicate *why* the order — feel free to override based on what you want to demo first.

Codes in **[ ]** trace back to the audit (`Bx` = bug, `Kx` = known issue, `§x.x` = proposal section).

---

## Tier 1 — Correctness & security (do these before showing the app to anyone)

1. **Fix login bypass via `@gmail.com`** [B3, §6.5] — Rewrite `getUserRoleByEmail` in `src/app/(auth)/login/page.jsx:21-26` to either (a) delete the function entirely (workspace gatekeeper already re-reads the role from Firestore) or (b) restrict to GIMPA domains + the super-admin allowlist used in signup. Also remove the dead `roleFromEmail` variable.

2. **Fix department / role inconsistency that breaks Secretariat routing** [B7, B13, B14] — Consolidate the department list into a single shared module (e.g. `src/app/(auth)/signup/departments.js`); import it from `RoleSelector.jsx`, `Users.jsx`, and (new) booking-approval UI. Fix the typo `"Scool"` → `"School"`. Enforce in `signupUser.js` that any user whose role is in `departmentRoles` must have a non-null `department` before `setDoc`.

3. **Add Firestore security rules to the repo** [B6, §6.5] — Add `firestore.rules` enforcing role-based access for `users`, `resources`, `bookings`. The rules must mirror the `cannotBookRoles` / `visibleToRoles` / `visibleToDepartment` shape that `createBooking.js` writes. Wire it into `firebase.json`.

4. **Make signup atomic — clean up Auth user on Firestore failure** [B11] — In `signupUser.js`, wrap the `setDoc` in a try/catch and call `user.delete()` if Firestore write fails, then rethrow. Prevents orphaned auth accounts that can never sign in.

5. **Fix `next.config.mjs` for Next 16** [W1, W2, K3] — Remove the unrecognized `eslint` key. Decide explicitly whether to keep CI lint enforcement; if yes, add a `npm run lint` step to whatever CI runs (none currently configured).

## Tier 2 — Finish what's already half-built

6. **Wire up the booking-approval UI** [B1, B2, §6.7, §10.1] — Three sub-tasks:
   - 6a. Create `src/app/workspace/resource-management/services/fetchBookings.js` that queries `bookings` filtered by `visibleToRoles` (array-contains the requester's role) **and** `visibleToDepartment` (== requester's dept) when applicable. Must reflect the schema written by `createBooking.js:27-59`.
   - 6b. Create `services/approveBooking.js` and `services/rejectBooking.js` that update `status`, `approvedBy`/`rejectedBy`, and a `decidedAt` timestamp.
   - 6c. Add the missing CSS file `src/app/styles/resource-management/booking-table.css` [B8] referenced by `BookingTable.jsx:11`.
   - 6d. Add the missing render branch in `workspace/page.jsx`: `{activeSidebar === "Resource Management" && activeTab === "Bookings" && <BookingRequests />}`.

7. **Hook up the student ID upload** [B4, §6.5] — Either accept `idFile` in `signupUser.js`, upload to Firebase Storage at `users/{uid}/id.png`, store the download URL on the user doc; or remove the file input from `signup/page.js` to stop lying to users.

8. **Fix the asset-code race condition** [K2] — Replace the read-then-write in `AddResourceForm.jsx:131-178` with a Firestore transaction over a `counters/{categoryCode}_{typeCode}` doc that atomically increments the sequence. Or use `runTransaction` to read the max from `resources` and write in one shot.

9. **Implement the `LogoutButton` and surface it** [B10] — Real `signOut(getAuth(app))` + `router.push("/login")`. Wire it into the Header (use the empty `ProfileTrigger.jsx` slot or a simple dropdown).

10. **Decide on the second Firebase config file** [K1] — Either (a) delete `src/firebaseConfig.js` and update `login/page.jsx` to dynamic-import `@/firebase/config` instead, or (b) leave both but add a code comment in each pointing at the other. Currently both work but are an avoidable trap for future contributors.

## Tier 3 — Big proposal features (pick one at a time; each is multi-PR)

11. **Check-in + auto-release** [§6.1, §6.5, §10.2] — Add `status` lifecycle to bookings: `pending → approved → in_use → completed | no_show`. Build a Check-In button visible only between booking start and start+grace. Add a Cloud Function (new `functions/` dir) on a schedule to flip `approved` bookings to `no_show` after the grace window. Requires Tier 1 #3 (rules) first.

12. **Fault reporting & maintenance dashboard** [§6.8, §10.3] — New Firestore collection `faults`. Add a "Report Issue" entry point from `ResourceTable` row. Add a render branch under sidebar `Maintenance` showing faults assigned to `Maintenance Officer`s. Storage upload for images.

13. **Analytics dashboard** [§6.2, §6.10] — Add `chart.js` (or `recharts`) dependency. New render branch under sidebar `Analytics` aggregating bookings by resource, by department, by time-of-day. Read-only; admins only.

14. **Resource condition + maintenance history** [§6.3] — Extend the `resources` doc with `condition`, `lastServicedAt`, `serviceCount`. Auto-update when a fault is marked `Resolved` in #12.

15. **Notifications (FCM)** [§6.6, §8.4] — Wire FCM for: booking approved/rejected, fault assigned to you, check-in reminder. Requires VAPID key + service worker.

16. **Policy enforcement & reputation score** [§6.9] — Add `reputationScore` to user doc; decrement on `no_show` from #11; gate booking creation by score threshold; expose admin UI to override.

17. **Academic timetable integration** [§6.4] — Lowest priority — needs an integration partner. Stub: a `timetable` Firestore collection an admin can populate manually, and `createBooking.js` checks for overlap with academic events before allowing.

## Tier 4 — Hygiene (do whenever)

18. **Delete or stub dead sidebar items** [B9] — `Chat`, `Maintenance`, `Analytics`, `AI Assistant`, `Dashboard` either need a render branch (Tier 3) or should be removed from `Sidebar.jsx:46-51` to stop showing broken UI.

19. **Bump `baseline-browser-mapping`** [W3] — `npm i baseline-browser-mapping@latest -D` to silence the warnings.

20. **Remove or fill `ProfileTrigger.jsx`** [B5] — 0-byte file; either implement the profile menu (covered partly by #9) or delete it.

21. **Add at least one test** — There is no test suite. Even a single Vitest/Jest test of `getBookingRecipients` (pure function, easy target) would establish the pattern.

22. **Document Firestore schema** — A short `docs/SCHEMA.md` listing the documented fields on `users`, `resources`, `bookings`. Currently the schema is inferred from `setDoc` call sites scattered across the code.

---

## Suggested first sprint

If you want to ship the "approval flow demo" the proposal pitches:
**#1 → #2 → #3 → #6 → #11** gets you a working request → approve → check-in → auto-release loop on top of correct auth and routing.

If you want maximum demoable surface area fast:
**#1 → #6 → #9 → #13** gets you a slick admin panel with login, booking approval, logout, and a charts page — enough for a stakeholder demo.
