# Sprint 6: Lesson progress lifecycle

## State machine

`NOT_STARTED -> IN_PROGRESS -> COMPLETED` is a one-way lifecycle. `NOT_STARTED`
is represented by the absence of a progress row; the course overview materializes
it in its response. The first authenticated student open creates `IN_PROGRESS`
and `startedAt`. Completion is idempotent, and the first `completedAt` value is
never overwritten.

`NOT_STARTED` is intentionally not a PostgreSQL enum value: no row exists until
the first open. The persisted `LessonProgressStatus` enum therefore contains
only `IN_PROGRESS` and `COMPLETED`.

## Schema audit

- `users.id`, `courses.id`, `chapters.id`, `lessons.id`, and `enrollments.id`
  are UUIDs. Progress uses UUIDs consistently and defaults its primary key with
  the repository-standard `public.uuid_generate_v4()`.
- Enrollment uniqueness on `(user_id, course_id)` and nullable `revoked_at`
  support the active-enrollment check performed before every progress write.
- The legacy table used `(enrollment_id, lesson_id)` as its primary key. The P2
  migration preserves its rows while replacing this shape with a UUID primary
  key and the student-facing relationships.
- User, lesson, and course foreign keys cascade deletes. A composite
  `(lesson_id, course_id)` foreign key additionally prevents a progress row
  from naming a course different from its lesson's course.

The table records `started_at`, `last_accessed_at`, `completed_at`, `created_at`,
and `updated_at`. Its indexes are `idx_lesson_progress_user_course`,
`idx_lesson_progress_user_lesson`, and `idx_lesson_progress_completed`; the
unique constraint `UQ_lesson_progress_user_lesson` enforces one row per learner
and lesson.

Opening or merely fetching lesson content never completes a lesson. All writes
require an active enrollment and are scoped by the authenticated user ID.

## Completion strategies

| Type | Completion evidence | Position |
| --- | --- | --- |
| TEXT | Explicit Mark as Completed request with `scrollPercentage >= 80` | Percentage is client evidence; completion is rejected below 80 |
| VIDEO | `percentage >= 85` or `ended: true` | Whole playback seconds; client sync is throttled to once per 10 seconds |
| DOCUMENT, download enabled | Download click, or final page followed by Mark as Completed | Not applicable |
| DOCUMENT, download disabled | Final page followed by Mark as Completed | Not applicable |

The service validates the strategy against the authoritative lesson type and
download policy. A generic completion request cannot complete a video.

## API

- `GET /api/v1/courses/:courseId/progress` returns counts, an exact percentage,
  and every published lesson with its materialized status.
- `POST /api/v1/lessons/:id/progress/start` performs the first-open transition.
- `PATCH /api/v1/lessons/:id/progress/heartbeat` atomically upserts
  `lastPosition` and refreshes `lastAccessedAt` without regressing a completed
  status.
- `POST /api/v1/lessons/:id/progress/complete` validates TEXT or DOCUMENT
  evidence. `/api/v1/lessons/:id/complete` is a compatibility alias.
- `PATCH /api/v1/lessons/:id/video-progress` accepts
  `{ seconds, percentage, ended? }`, persists the furthest position, and applies
  the video threshold.

All mutation endpoints are safe to retry. Completion status never moves
backward, video position uses `GREATEST`, generic heartbeat stores its supplied
position, and completion time uses `COALESCE`.
Every mutation response contains both `progress` and a rounded
`courseProgress` aggregate. Authentication uses Shanity's cookie-backed
`SessionGuard` (the repository's JWT/session equivalent) together with
`LessonAccessGuard`; the service independently enforces active enrollment.
