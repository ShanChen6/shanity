# C14 — Instructor Portal

The portal lives under `apps/web/src/app/(instructor)/instructor` and uses its own layout, navigation, forms and feature components. It does not import Admin pages or Admin feature components. The shared session, theme and primitive UI components remain in use.

## Setup

Install workspace dependencies, then apply the forward migration before starting the updated API:

```sh
pnpm install
pnpm --filter api db:migrate
pnpm --filter api build
pnpm --filter web build
```

Migration `202610020005_instructor_portal` adds category, level, language, integer VND price, chapter-backed lessons and thumbnail storage. Existing `course_sections` and their lessons remain intact. New lessons use `chapter_id`; a database constraint requires exactly one parent (legacy section or chapter). Reorder positions are zero-based and stored as `position`, matching the existing Chapters API.

## Routes and behavior

- `/instructor/courses`: owned courses, search, status filter, nine courses per page, status badges and edit/preview links. Filtering/pagination currently operate over the existing authenticated list response.
- `/instructor/courses/new`: title, editable generated slug and category; creates a draft.
- `/instructor/courses/[id]/edit/basic`: explicit save, metadata, free/paid pricing and thumbnail upload. Markdown supports headings, bullet lines and paragraphs; raw HTML is rendered as text.
- `/instructor/courses/[id]/edit/curriculum`: chapter/lesson CRUD and accessible up/down reorder. Video lessons accept HTTP(S) media URLs; Quiz supports title/type and Markdown questions/instructions, not quiz scoring.
- `/instructor/courses/[id]/preview`: private preview, expandable lessons, video playback and publishing checklist. Publish, Unpublish and Archive require confirmation. Archive remains terminal, consistent with the existing lifecycle.

Server layout and live session require the `instructor` role. Course/chapter ownership is enforced by the API; the UI presents explicit 403 feedback. TanStack Query is scoped to the current user; save and reorder optimistically update cache, restore the previous value on failure and invalidate affected queries. Basic-info forms show unsaved state and warn before closing/reloading the browser tab.

## API additions

- `POST /courses/:id/unpublish` returns a published course to `draft` and clears `publishedAt`.
- `GET /courses/:courseId/lessons` lists chapter-backed lessons.
- `POST /courses/:courseId/chapters/:chapterId/lessons` creates a lesson.
- `PATCH /courses/:courseId/lessons/:id` updates title, type, body and video URL.
- `DELETE /courses/:courseId/lessons/:id` deletes a lesson.
- `PATCH /courses/:courseId/chapters/:chapterId/lessons/reorder` accepts `{ ids: string[] }`, exactly the full chapter membership. Course-level transaction locks serialize structural edits and publish.
- `POST /courses/:courseId/thumbnail` accepts multipart `file`, validates static JPEG/PNG/WebP up to 2 MB/16 megapixels and normalizes it to WebP using the existing image normalizer. Returns `{ url }`; explicit course save applies the URL.
- `GET /course-media/:id` serves the normalized image publicly with immutable caching. Media bytes live in PostgreSQL, so no new filesystem/object-storage configuration is required. Uploads not applied to a course remain stored; retention/garbage collection is a future operational concern.

API status values are lowercase; badges show uppercase labels. Publish retains the existing stronger checks: all chapters/legacy sections need a lesson, and all lessons need text or video content, in addition to description and thumbnail.

## Verification

```sh
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
```

Use an isolated database whose name ends in `_test`, configure `PG*`, JWT settings and `WEB_ORIGIN` per `auth-frontend.md`, then build/migrate before running:

```sh
node --test --test-isolation=none apps/api/test/instructor.integration.mjs
```

With API/web running against that database, set `AUTH_BROWSER_TEST=1`, `API_TEST_URL`, `WEB_TEST_URL` and optionally `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`:

```sh
pnpm --filter web exec playwright test tests/instructor.spec.ts
```

The integration test covers ownership, student denial, invalid payloads, complete lesson reorder, media validation, publish guards, public visibility, unpublish, deletion and archive. The browser test covers creation, Vietnamese slug generation, save/upload, reorder rollback, lessons, confirmation dialogs, publish/unpublish, search and desktop/tablet screenshots.
