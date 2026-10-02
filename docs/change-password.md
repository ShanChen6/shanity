# U4 — Change Password

Authenticated users open **Đổi mật khẩu** from `/profile`. The dialog asks for
current, new and confirmation passwords, validates with the existing registration
policy (12–128 characters), and sends only current/new passwords. Cancellation
and success clear the form. Submission is guarded against duplicate clicks.

`PATCH /users/me/password` uses `OriginGuard`, `SessionGuard` and `AuthRateGuard`.
`ChangePasswordDto` rejects unknown properties, including caller-supplied user IDs.
Identity and session ID come exclusively from the authenticated principal.

The existing `AuthService` locks the current session then user in a transaction
(the same order as refresh), checks the session/user are still active, rejects a
missing password hash, verifies the current password with existing scrypt helpers,
and rejects reuse of the current password. It updates only `users.password_hash`;
the existing database trigger maintains `update_at`. Session revocation commits
atomically with the password update. The response is 204 and clears both HttpOnly
cookies. Old access and refresh tokens for this session are rejected immediately.
Other sessions remain active, matching the requested current-session logout scope.

The frontend reuses SessionProvider's session lock and logout broadcast, clears
its user state, and ProtectedSession redirects to `/login?passwordChanged=1`.
The login screen shows the success notice. This query flag is informational only
and grants no authorization. `/users/me` exposes `hasPassword`, never the hash;
OAuth-only accounts see a disabled action and explanation. The API independently
rejects these accounts with a domain-specific 400 message.

No schema migration or new dependency is required. Forgot/reset password, OAuth
password setup, email changes and 2FA are outside this change.

Validation performed using an isolated PostgreSQL database:

- API build and frontend typecheck pass.
- Backend unit tests: 7 pass; Auth integration tests: 13 pass.
- U4 Chrome browser tests: 2 pass (validation, cancellation, wrong current
  password, logout, old/new login, success notice and OAuth-only disabled action).
- Frontend lint on changed files passes.

API integration coverage includes missing authentication, CSRF, arbitrary user ID,
password length, missing fields, incorrect/unchanged password, unchanged user
fields, cleared cookies, revoked access/refresh, retained other sessions, OAuth-only
rejection and the existing rate limiter.
