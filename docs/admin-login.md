# Separate Admin Login — implementation report

## Previous Admin Architecture

Audit completed before editing. Tasks 1–10 already provide the protected admin layout/navigation, user list/search/filters/pagination, detail, role changes, account status, SQL overview statistics and UX polish. They are retained, not rebuilt.

NestJS AuthModule provides one AuthController/AuthService and UsersController. There is no separate JWT strategy/User entity/Role enum service: jose signs/verifies HS256 JWTs; Knex accesses users, user_roles and roles; role codes are student/instructor/admin, and accounts can have several roles. SessionGuard authenticates the session and enforces @Roles using current database roles. OriginGuard and rate limiting protect auth writes. Public registration only assigns student.

Access/refresh cookies are HttpOnly, SameSite=Lax, path=/, Secure with __Host- names in production. Access tokens refer to server sessions; refresh tokens are stored hashed and rotated. Status and revoked/expired sessions are checked server-side. No authentication infrastructure was duplicated or changed in the backend.

Frontend uses Next App Router, proxy.ts, server requireRole and client ProtectedSession. SessionProvider/API client coordinate refresh with Web Locks and cross-tab broadcasts. Before this change, every protected route redirected to /login, and logout was only available in the user profile.

## Changes Made

Added a public Admin Auth route group with separate AdminLoginPage, AdminLoginForm and AdminAuthLayout. Added an admin-context logout button to the existing header. Redirect helpers now choose the correct login entry and validate admin return URLs. Shared signIn returns the backend current-user profile for the caller's role check; its cookie/session mechanics are unchanged.

## User Login Flow

/login and /register retain their existing UI, forms, Google flow, validation and default /profile destination. User-profile logout still returns to /login. Neither existing page was repurposed as Admin Login.

## Admin Login Flow

/admin/login has a minimal branded Admin Portal layout, email/password fields and sign-in control, with no registration, OAuth buttons or student navigation. Credentials use POST /auth/login, then GET /users/me through the shared session provider. Only a trusted current-user profile containing admin permits navigation to the validated admin destination. Invalid credentials stay on the form with an error; student/instructor credentials show an explicit access-denied message.

Since backend authentication is shared, valid non-admin credentials establish their normal user session, but never grant admin access. The form allows trying a different account. This is UI/routing separation, not two independent simultaneous browser sessions.

## Route Protection

/admin/login is outside the protected route group and explicitly public in proxy.ts, preventing a guard loop. A server-side current-user check redirects already-authenticated admins away from the login form. Protected admin pages retain requireRole('admin') and ProtectedSession; authenticated non-admins still go to /forbidden.

## Backend Authorization

No backend endpoint, role policy, secret, cookie name or token storage was added. All existing admin APIs retain SessionGuard + @Roles('admin'); student/instructor direct requests remain 403. There is no hard-coded admin identity, admin table, second AuthService, admin access token or admin refresh token.

## Redirect Behavior

- Guest /admin → /admin/login.
- Guest /admin/users and detail/filter URLs → /admin/login?redirect=<validated destination>.
- Successful admin login → preserved admin destination, default /admin.
- Authenticated admin /admin/login → /admin (or an explicitly requested valid admin destination).
- Authenticated non-admin protected admin URL → /forbidden; admin login itself remains accessible with the access-denied message.
- Admin-header logout uses the existing /auth/logout and returns to /admin/login. Other admin tabs observe logout via the existing broadcast; User Portal tabs use /login.
- Return paths must stay inside /admin, excluding /admin/login. External/protocol-relative URLs, backslashes/control characters, encoded traversal, duplicate separators and auth loops fall back safely. User redirect validation also rejects /admin/login as an auth-loop destination.

## Files Created

- apps/web/src/app/(admin-auth)/layout.tsx
- apps/web/src/app/(admin-auth)/admin/login/page.tsx
- apps/web/src/features/admin/auth/admin-auth-layout.tsx
- apps/web/src/features/admin/auth/admin-login-form.tsx
- apps/web/src/features/admin/auth/admin-logout.tsx
- apps/web/tests/admin-redirect.spec.ts
- docs/admin-login.md

## Files Modified

- apps/web/src/proxy.ts: make admin login public.
- apps/web/src/lib/auth-redirect.ts: validated admin destinations and portal-aware login URL.
- apps/web/src/lib/server-session.ts: share an optional server session read with the public admin login page.
- apps/web/src/features/auth/session-provider.tsx: return the verified profile from signIn.
- apps/web/src/components/layout/admin/admin-header.tsx: mount the standalone admin logout control.
- apps/web/tests/auth.spec.ts: update expected guest redirects and add the admin auth matrix.
- docs/admin.md: link this report.

## Regression Test

Browser regression: all 36 checks passed across the full run (33 passed) and the targeted rerun of three tests after scoping their alert selectors to the login form. Existing User Portal authentication, Google login, refresh and Admin Tasks 1–10 remain covered. API unit tests: 7/7 passed. A SHA-256 comparison confirmed 43 existing backend/schema, Login/Register and admin feature files remained unchanged.

## Security Test

Covers guest redirects, public login/no loop, admin login/already-authenticated redirect, student/instructor rejection and direct admin API 403s, wrong credentials, shared refresh recovery, logout across admin tabs, no additional auth cookies, and malicious/encoded return URLs.

## Build Results

Frontend lint and TypeScript checks passed. API lint and build passed. Both Docker production targets (`web` and `api`) built successfully, including the Next.js production build with `/admin/login`. `git diff --check` passed. Tests used an isolated PostgreSQL database and the existing mocked OAuth browser fixture; no production service was changed.

## Remaining Issues

No application database migration or deployment is required for this UI/routing change. Existing deployment requirements (shared cookie hostname for web/public API and API_INTERNAL_URL for server calls) remain. Existing user status/update_at migrations from previous tasks must already be applied when running those features.
