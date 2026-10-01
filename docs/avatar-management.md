# U3 — Avatar Management

## Existing Avatar/Storage Architecture

Before U3, users had no avatar reference, upload endpoint, storage provider or static upload directory. Google OAuth stored provider identity but not provider photos. The reusable Avatar component already supplied initials and Next Image. Profile and the account header consumed SessionProvider; Edit Profile reused PATCH /users/me.

## Storage Strategy Selected

A small injectable AvatarStorage contract exposes put/read/delete. LocalAvatarStorage stores generated WebP files outside PostgreSQL and serves them through a narrowly scoped API controller. No cloud credentials are needed or fabricated. Another provider can replace the binding in AuthModule without changing the profile flow.

Local storage is suitable for development and a single API deployment with durable storage. Compose mounts the named avatar_data volume at /data/avatars. Multiple API hosts need shared storage or a replacement object-storage provider before scaling. Back up this volume together with the database; container writable layers alone are not durable storage.

## Database Changes

users.avatar_key is nullable text. Existing rows remain null. PostgreSQL stores only a generated key, never file bytes/base64. GET /users/me and existing PATCH /users/me now include avatarUrl (an API-relative /avatars/<uuid>.webp path or null). Internal filesystem paths and avatar_key are not exposed in the current-user response. Self-profile DTO still accepts only displayName.

## Migration

202610020001_user_avatar.mjs adds the nullable column without rewriting existing users or changing their identities. It follows the repository's forward-only migration convention. Apply migrations before deploying the API that reads avatar_key:

```sh
pnpm --filter api db:migrate
```

Use the intended environment's database settings. Compose's existing migrate service runs before the API. Only isolated test databases were migrated during this task; existing running application containers/databases were not upgraded.

## Avatar APIs

| Method | Route | Behavior |
| --- | --- | --- |
| POST | /users/me/avatar | Authenticated multipart upload; exactly one file field named file; returns updated current user, 200 |
| DELETE | /users/me/avatar | Authenticated removal; no body fields; null avatar is safe; returns updated current user, 200 |
| GET | /avatars/:key | Public managed WebP by validated generated key; 404 for missing/invalid key |

Upload/remove use OriginGuard, SessionGuard and the existing rate limiter (10 requests per IP/handler per minute). CORS permits DELETE from the configured web origin. There is no self-service endpoint for another user's ID.

## File Validation

- Backend and frontend maximum: 2 MiB (2 × 1024 × 1024 bytes).
- Accepted declared MIME types: image/jpeg, image/png, image/webp.
- Sharp validates decoded content and requires the detected format to match the MIME; extensions and original filenames are not trusted.
- Input limit: 16 million pixels; reject unreadable/truncated/mismatched and multi-page images.
- Re-encode to WebP, apply EXIF orientation, strip metadata, fit inside 512 × 512, without upscaling. UI uses circular object-cover; no crop dependency or crop UI.
- Multer limits file size, file count, multipart fields and parts. Extra files/fields are rejected before storage.

Sharp already existed transitively via Next; the API now declares the same pinned version directly. Multer is provided by the existing Nest Express platform; only its TypeScript declarations were added. Processing follows [Sharp input safety options](https://sharp.pixelplumbing.com/api-constructor/) and the existing stack's [Nest upload interceptor](https://docs.nestjs.com/techniques/file-upload).

## Upload Flow

Select file → client type/size checks → preview → confirm → bounded server upload → content validation/normalization → storage put with an exclusive UUID key → transaction locks the authenticated user's row → save key and read safe profile → commit → synchronize current user.

No original filename becomes a storage path. The file is fully written before its reference can be committed. File and preview data are not stored in browser persistence.

## Replace/Delete Flow

Replacement uploads a new UUID object first. A row lock serializes replace/remove requests for the same account. After commit, the old managed key is deleted. A database/query failure rolls back and attempts to delete the newly uploaded object. Failed cleanup logs a safe warning and does not turn a committed change into an API failure.

Removal clears the DB reference in the same locking transaction, then deletes the old managed file. Null removal returns success. Only keys matching the generated UUID/WebP format can be deleted: no remote OAuth image or caller-supplied path is ever deleted.

Keys/URLs change per upload. Public images use image/webp, nosniff and immutable caching. Removal clears the account reference and origin file; previously cached/downloaded copies cannot be recalled.

## Frontend Components

AvatarManager provides select/change/preview, explicit upload, cancel, pending protection and removal confirmation using existing buttons, input, alerts and dialog focus utilities. The preview Object URL is revoked on change, cancel, success or unmount. Validation/storage/network errors retain the preview for retry; session expiry follows existing authentication handling.

CurrentUserAvatar is shared by Profile, the account menu and the existing authenticated avatar in the Admin header. No Admin management actions or permissions changed. The base Avatar now resets image-load state when src changes and hides failed images so initials remain visible.

These already-normalized avatars and local blob previews use Next Image unoptimized. CurrentUserAvatar constructs URLs only from the configured API origin and a validated /avatars/<UUID>.webp path. No wildcard remote-image allowlist or Next image proxy is added.

## Current User Synchronization

SessionProvider reuses one updateSelf path for profile edits and avatar mutations. Successful responses update user state, success feedback and the existing cross-tab changed event. Profile/menu/initials update without F5. Old in-flight reads cannot overwrite a committed write; if another tab changes the generation during a mutation, the provider re-reads the authenticated identity instead of applying an obsolete response. Cross-tab concurrent avatar responses are covered by a browser test.

## Security

Authentication and origin checks run before upload interception. The backend derives the target only from req.principal.id. Strict multipart limits reject arbitrary userId/id/role/avatar_key fields. PATCH /users/me retains its whitelist. Filenames cannot select files or directories. Storage reads/deletes validate generated keys and never expose the storage root. The generic exception filter returns safe messages for storage/DB failures.

Avatar images are public to anyone with their URL; the dialog states this before upload. No Google/OAuth photo field is shared with managed storage.

## Files Created

- apps/api/database/migrations/202610020001_user_avatar.mjs
- apps/api/src/avatar/avatar-storage.ts
- apps/api/src/avatar/avatar.service.ts
- apps/api/src/avatar/avatar.controller.ts
- apps/api/test/avatar.e2e-spec.ts
- apps/web/src/features/auth/avatar-manager.tsx
- apps/web/src/features/auth/current-user-avatar.tsx
- docs/avatar-management.md

## Files Modified

- apps/api/src/auth/auth.module.ts — register storage/provider/controllers.
- apps/api/src/auth/auth.service.ts — safe avatarUrl and transactional profile reads.
- apps/api/src/setup.ts — DELETE CORS method.
- apps/api/package.json, apps/api/tsconfig.json, pnpm-lock.yaml — Sharp and Multer types.
- apps/web/src/lib/api.ts — FormData boundary handling, avatar response field and safe upload errors.
- apps/web/src/features/auth/session-provider.tsx — avatar mutations and shared synchronization.
- apps/web/src/features/auth/profile.tsx, user-header.tsx — avatar controls/rendering.
- apps/web/src/components/ui/avatar.tsx — source changes and failed-image fallback.
- apps/web/src/components/layout/admin/admin-header.tsx — only display the current user's avatar.
- apps/web/tests/auth.spec.ts — avatar regression coverage and prior placeholder expectation.
- compose.yaml, .env.example, .gitignore, .dockerignore — durable local storage and upload exclusion.
- docs/profile.md, docs/edit-profile.md, docs/docker.md — link this follow-up and storage operations.

Prior uncommitted Profile/Edit Profile work remains intact. Generated backend dist changes from validation are not part of the source change.

## Environment Variables

AVATAR_STORAGE_DIR is optional for the API and defaults to uploads/avatars relative to its working directory (normally apps/api when using pnpm --filter api). A direct node invocation from repository root uses that root instead. Set an absolute writable directory for predictable non-Compose deployment:

```sh
export AVATAR_STORAGE_DIR=/absolute/path/to/persistent/avatars
```

Compose fixes it to /data/avatars with the avatar_data volume. Do not point this directory at arbitrary user-controlled paths, the source tree, or a temporary production directory. Existing NEXT_PUBLIC_API_URL continues to select the public image/API origin. No new secret or public storage credential was introduced.

## Test Results

- 7 backend unit tests passed.
- 26 backend integration tests passed on a fresh isolated database, including 7 new avatar integration tests.
- 70 distinct Chromium Playwright tests passed: full suite 67/67 plus 3 subsequently added targeted cases. After the final filename-display adjustment, the affected selection/cancel/upload cases were rerun.
- JPEG, PNG, WebP; normalization/no upscale; wrong MIME/content; oversized/pixel-limit/truncated data; missing/extra multipart fields/files; guest/CSRF/other-user access; traversal; null delete; replace/read/remove; storage failure; transactional DB failure; old-object cleanup failure; concurrent replace/delete were tested.
- Browser tests cover preview/cancel, double-action guards, replace/reload, Edit Profile preserving avatar, header/profile/cross-tab synchronization, 400/413/415/500/network errors, failed delete, expired session, failed-image initials, revoked preview URLs and cross-tab concurrent uploads.
- Responsive dialog flows passed at 375/768/1024/1440px; mobile and desktop preview screenshots were visually inspected.
- Existing login/register, Google test-provider OAuth, Admin login/dashboard/users and Edit Profile regressions passed. Other browser engines were not exercised.

An initial backend run on the previous task's reused test database hit a pre-existing static-name fixture collision. Running the suites on a fresh isolated database passed; production queries were not changed to accommodate test data.

## Build Results

Frontend ESLint, Next type generation/TypeScript and production build passed. Backend oxlint, Nest build and tests passed. Docker api/web targets built successfully with native Sharp on Alpine, and compose config validation passed. Docker runtime smoke checks verified registration, actual avatar upload/image read, web login response and image persistence after restarting the API container with the same volume.

## Remaining Issues

No known functional blocker. Local storage requires a durable volume and coordinated database/file backups; distributed deployment needs shared/object storage. Cleanup is best-effort: a process crash or failed file deletion may leave unreferenced files. A durable cleanup worker is not included. For reconciliation, compare managed filenames against SELECT avatar_key FROM users WHERE avatar_key IS NOT NULL; operate on a consistent snapshot or during paused writes and retain a grace period so in-flight uploads are never deleted. Investigate cleanup warnings and disk capacity.

No cloud storage credentials, image crop, OAuth photo import, password change or email change were added. Public image caching has the removal limitation described above.

## Recommended Next Task

U4 — Change Password, as a separate task with its own authentication and session-invalidation requirements. It is not implemented by U3.
