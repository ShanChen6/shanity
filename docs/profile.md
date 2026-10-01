# User Profile foundation

Avatar management is now implemented in [U3 — Avatar Management](avatar-management.md); this supersedes earlier avatar-placeholder restrictions.

This is the foundation-stage report. The subsequent [Edit Profile implementation](edit-profile.md) enables display-name editing and supersedes the read-only action restrictions below.

## Existing User Architecture

Next.js App Router uses a root SessionProvider, HttpOnly access/refresh cookies, a shared API client with refresh locking, server requireUser checks, and ProtectedSession for browser logout/revocation. The proxy preserves protected destinations. User login and admin login have separate UI and redirect handling. Dashboard and My Courses are placeholders; no instructor destination exists.

NestJS UsersController GET /users/me resolves the principal through SessionGuard and AuthService.profile. There is no /auth/me. The database contains display_name, email, status, created_at and update_at; roles live in user_roles. The current-user response deliberately selects only id, email, displayName and roles. Existing PATCH /users/me and Google linking APIs remain unchanged.

## Profile Architecture

Read-only Profile uses existing PageContainer, Card, Avatar, Badge, Button and Alert components and theme tokens. Personal information uses the actual displayName field (not a fabricated legal/full name). Account information shows roles. Edit Profile, Change Password and Avatar actions are disabled with an explanatory description. The old profile mutation/linking/admin-check UI is removed; no mutation business logic was added.

Existing ProtectedSession handles loading, retry and session expiry before rendering profile content. Current-user response validation rejects missing/malformed required data, allowing the existing error/retry state to recover. No arbitrary user lookup or browser token storage is introduced.

## Route Added

No new route needed: existing /profile is rebuilt in place. It remains authenticated, outside AdminLayout. Guests go to /login?redirect=%2Fprofile. Admin identities may access their own profile without redirecting to /admin.

## Current User Data Source

useSession() backed by GET /users/me. No duplicate endpoint or request path. Sensitive database fields are neither returned nor rendered.

## Components Created

UserHeader: reusable authenticated account navigation with avatar/name, Profile link and Logout. Native details/summary disclosure supports keyboard activation, Tab navigation, Escape focus return, and closing when focus leaves. Logout errors are displayed and pending requests are guarded.

## Files Modified

- apps/web/src/features/auth/profile.tsx — read-only profile UI.
- apps/web/src/features/auth/user-header.tsx — new account header.
- apps/web/src/lib/api.ts — validate current-user response.
- apps/web/tests/auth.spec.ts — update prior mutation UI tests and add profile coverage; Google linking remains tested through its existing API/provider callback.
- docs/profile.md — architecture and verification report.

## Login Redirect Changes

None required. Existing safeRedirect defaults STUDENT/INSTRUCTOR login to /profile and preserves safe explicit return URLs. Admin entry still defaults to /admin. Register and Google return behavior remain covered by tests.

## Responsive Test

Chromium browser checks pass at 375, 768, 1024 and 1440px: no horizontal overflow, disabled future actions, and keyboard menu navigation. Screenshots at 375 and 1440px were visually inspected. Mobile header stacks; desktop information cards use two columns. Other browser engines were not tested.

## Auth Regression Test

46 distinct Playwright tests passed against an isolated PostgreSQL database and production web build. Initial run: 42 passed, 1 test selector failed because Next's route announcer also has role=alert. After scoping the selector to main, all 4 affected/additional tests passed (missing data, network error, server error, instructor restore).

Coverage includes guest protection, registration, student/instructor identity, login return URLs, reload, logout across tabs, coordinated refresh, revoked sessions, Google login/linking via test provider, admin login/role guards, and admin user management. Loading checks confirm no profile/Guest flash before current-user restoration.

## Build Results

Passed: frontend ESLint, next typegen + TypeScript, production Next build; backend oxlint, 7 Vitest unit tests, Nest build. Generated tracked backend dist changes from validation were restored; no backend implementation changes are included.

## Backend/Profile Gaps

GET /users/me does not expose account status or joined date even though they exist in the database. They are intentionally omitted from this UI. No avatar URL or separate full-name field exists in the current-user contract. Existing profile update API is preserved but not exposed in this read-only UI.

## Recommended Next Task

Define the next profile contract and editable fields, then implement Edit Profile as a separate task using the existing PATCH /users/me endpoint. Avatar and password changes need separate requirements and flows.
