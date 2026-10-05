# Sprint 5 — Definition of Done

## Acceptance metrics

| Area | Evidence | Result |
| --- | --- | --- |
| Sample curriculum | Seed creates one published course with 3 chapters and 9 ordered lessons | Pass |
| Student happy path | Desktop 1440px and mobile 375px Playwright projects | Pass |
| Lesson authorization | Guest, unenrolled student, draft preview, non-owner instructor and direct-media tests | Pass |
| Text safety | Backend HTML sanitization and safe client rendering tests | Pass |
| Media access | Private video/document access policies and signed local media delivery tests | Pass |
| Failure UX | Video 404, missing document, expired session and delayed network Playwright tests | Pass |
| Crash resilience | Every failure test records `pageerror`; expected count is zero | Pass |
| Static quality | API/web typecheck and lint | Pass |

## Failure-state expectations

- A failed video is replaced by a retryable media fallback instead of a black player.
- A missing document is replaced by the document support fallback instead of a broken iframe.
- A `401` during lesson loading stores `shanity:learning-resume`, displays the expiry state, and redirects to `/login?redirect=...`.
- Delayed lesson responses display a skeleton before content arrives, while navigation remains mounted.
- Security decisions are enforced by the API; frontend states are explanatory and are not authorization controls.

## Commands

```text
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web test:e2e
```

Playwright requires the L17 sample seed for the happy-path suite. The failure-UX suite uses deterministic route interception and does not mutate application data.
