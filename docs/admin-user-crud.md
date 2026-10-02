# Admin user creation and editing

The user dashboard now supports creating users and editing their display name/email. Existing role and status controls remain separate. Account removal uses the existing confirmed Disable Account action: records and relationships are retained, login and current sessions are blocked, and an admin can reactivate the account. No hard-delete endpoint or schema migration is introduced.

## UI

- `/admin/users`: **Thêm người dùng** opens a dialog for display name, email, initial password and role (Student, Instructor or Admin). New accounts are active. Creating an admin displays a privilege notice; submission explicitly confirms creation. Successful creation navigates to the new user's detail page without changing the current admin session.
- `/admin/users/[id]`: **Sửa thông tin** edits display name/email and confirms saving. Role and status still use their existing dedicated actions and safeguards.
- Dialogs provide keyboard focus containment/restoration, cancel, loading state, duplicate-submit prevention, validation, errors and success feedback. Password input is masked and cleared when the dialog closes. An email conflict keeps the form open with an actionable message.

## API

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /users` | `displayName`, `email`, `password`, `role` | 201 with safe user detail |
| `PATCH /users/:id` | `displayName`, `email` | 200 with safe user detail |
| `PATCH /users/:id/status` (existing) | `status: ACTIVE / DISABLED` | Safe user detail |

Creation accepts roles `STUDENT`, `INSTRUCTOR`, `ADMIN`; database role codes remain lowercase. Email is trimmed and lowercased, length limited and validated. Display name is trimmed and must contain non-whitespace characters (max 100); initial password uses the existing 12–128 character policy and password hashing. Updates require both profile fields and cannot change passwords, roles or status. Unknown properties are rejected.

All endpoints require a current admin session and the existing OriginGuard. Creation and editing use the same transaction lock as role/status mutations and recheck the actor's current active/admin state after acquiring the lock. User and role creation are atomic. Duplicate emails return 409; missing update targets return 404; invalid IDs/payloads return 400. Responses exclude hashes and authentication secrets. The existing database trigger updates `update_at` (returned as `updatedAt`). No authentication cookies or sessions are issued when an admin creates someone else's account.

## Validation

New browser/API coverage verifies creation and navigation, preserved admin identity, hashed passwords, role assignment, editing, cancel/focus, duplicate email handling, persisted updates and timestamp changes, disable without deletion and session denial. API checks cover guests, students/instructors, invalid origin, invalid roles/fields/passwords, unknown properties, case-insensitive email conflicts, absent targets, UUID validation and preservation of the static `/users/me` route.

All 38 browser checks passed across the full run (37 passed) and the targeted rerun of the detail test after updating its old read-only assertion to allow hidden edit-dialog fields. API unit tests: 7/7 passed. Frontend lint/typecheck and production build passed; API lint/build passed. `git diff --check` passed. Verification used disposable PostgreSQL and the existing mocked OAuth fixture. No deployment was performed.
