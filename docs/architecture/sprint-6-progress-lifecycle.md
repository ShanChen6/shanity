# Sprint 6: Lesson progress lifecycle

## State machine

`NOT_STARTED -> IN_PROGRESS -> COMPLETED` is a one-way lifecycle. `NOT_STARTED`
is represented by the absence of a progress row; the course overview materializes
it in its response. The first authenticated student open creates `IN_PROGRESS`
and `startedAt`. Completion is idempotent, and the first `completedAt` value is
never overwritten.

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
- `POST /api/v1/lessons/:id/progress/complete` validates TEXT or DOCUMENT
  evidence. `/api/v1/lessons/:id/complete` is a compatibility alias.
- `PATCH /api/v1/lessons/:id/video-progress` accepts
  `{ seconds, percentage, ended? }`, persists the furthest position, and applies
  the video threshold.

All mutation endpoints are safe to retry. Progress never moves backward, saved
video position uses `GREATEST`, and completion time uses `COALESCE`.
