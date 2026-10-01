# Edit Profile

Avatar management is now implemented in [U3 — Avatar Management](avatar-management.md); this supersedes earlier avatar-placeholder restrictions.

## Existing Profile Architecture

/profile is protected by the server requireUser check and browser ProtectedSession. SessionProvider restores the authenticated principal from GET /users/me and handles HttpOnly-cookie refresh, logout and cross-tab events. No /auth/me exists. The profile already uses shared design-system components; forms use React state, FormField/Input/Button and validator-based validation. Admin has its own feedback provider, so this user flow uses the existing session success Alert and inline errors instead of adding a toast system.

## Editable Fields

Only displayName, mapped to users.display_name. It is trimmed and validated as 1–100 characters on client and server. There is no separate full-name, phone, bio or date-of-birth field to expose.

## Protected Fields

Email is the login identity and remains read-only. IDs, roles, status, password/hash, timestamps, OAuth identifiers and permissions cannot be submitted through the self-update DTO. Unknown properties produce 400 under the existing global ValidationPipe (whitelist + forbidNonWhitelisted).

## API Added/Updated

No duplicate API and no production backend changes. Existing PATCH /users/me uses SessionGuard's req.principal.id, explicitly writes only display_name for that active account, and returns AuthService.profile's safe current-user response. Existing OriginGuard prevents cross-origin writes. No URL/body account ID selects the target. The database's existing trigger maintains update_at.

## DTO

Reuse the existing dedicated ProfileDto. It has only displayName with trim transformation, IsString, Length(1, 100) and Matches(/\S/). The self-update endpoint does not use the admin UpdateUserDto (which also accepts email).

## Frontend Changes

New EditProfile opens a native modal dialog from /profile. It reuses the existing focus-management hook without modifying Admin UI. Initial name focus, contained Tab navigation, Escape/Cancel, restored trigger focus, body scroll locking and responsive scrolling follow current conventions.

The form starts with current-user data, shows read-only email, disables unchanged saves, validates input, guards duplicate submissions, and prevents dismissal while saving. Cancel discards the draft. 400 errors are shown at the field; 409, server and network failures show safe messages while keeping the dialog/draft. 401 follows the existing refresh/session-expiry flow. Avatar/password actions remain disabled.

## Current User State Synchronization

SessionProvider.update reuses PATCH /users/me. Its safe response replaces the current user immediately, updates the success message and broadcasts the existing changed event. Profile, avatar initials and account menu update together; other tabs reload their current-user state. Incrementing the session generation after a successful update prevents older in-flight focus/bootstrap responses from restoring stale data. Existing generation checks still prevent an old write response from resurrecting a logged-out session.

## Security Tests

Real API and PostgreSQL checks confirm:

- Guest PATCH returns 401.
- Protected role/roles/status/email/id/userId/password/hash/timestamp/permission/provider fields return 400, with both users' database rows unchanged.
- Invalid/missing/blank/overlong/non-string names return 400.
- Another user's admin update route returns 403 for a student.
- Valid self-update trims the name, returns the authenticated ID, and leaves the other account unchanged.
- Revoked sessions cannot save and return to /login?redirect=%2Fprofile.

## Files Changed

This task:

- apps/web/src/features/auth/edit-profile.tsx — new edit dialog.
- apps/web/src/features/auth/profile.tsx — enable editing and update action copy.
- apps/web/src/features/auth/session-provider.tsx — success feedback and stale-read protection.
- apps/web/tests/auth.spec.ts — edit, persistence, security, errors, cross-tab and responsive coverage; adjust prior disabled-edit expectation.
- apps/api/test/auth.e2e-spec.ts — isolate rate-limit identity per test, preserving the actual limiter.
- docs/profile.md — link the foundation report to this follow-up.
- docs/edit-profile.md — this report.

The workspace also retains uncommitted foundation work from the preceding task. Generated backend dist changes from validation were restored; Admin implementation files were not changed.

## Test Results

57 distinct Playwright tests passed across the full run and targeted reruns: full run 55/56 passed; one existing Admin viewport/focus assertion failed and passed in an isolated rerun without code changes. The added stale-session-read test passed separately. This intermittent Admin assertion is recorded rather than claiming a clean single full-suite run.

All new edit tests passed, including save/database/refresh/header/cross-tab synchronization, cancellation, empty/overlong validation, double-submit prevention, 400/409/500/network retry and 401 expiry. Responsive dialog checks passed at 375/768/1024/1440px. Mobile and desktop screenshots were visually inspected in Chromium; other engines were not tested.

Backend: 7 unit tests and 19 integration tests passed. The initial integration run had 4 failures because its rate-limit test exhausted the suite-wide IP identity; giving each test a separate identity resolved the fixture issue without changing production behavior.

## Build Results

Frontend ESLint, Next typegen + TypeScript, production Next build, backend oxlint and Nest build passed. git diff --check passed.

## Remaining Issues

No known blocker for editing displayName. The existing Admin mobile-to-desktop focus assertion was intermittent during verification. Email changes, avatar upload and password changes remain outside this task. Current-user status/joined date are still absent from GET /users/me.

## Recommended Next Task

Agree on requirements for one separate capability, such as avatar upload (storage, file validation, limits and lifecycle), before implementation. No avatar, password or email-change logic was added here.
