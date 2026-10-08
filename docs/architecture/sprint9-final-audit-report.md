# Sprint 9 final audit report (E17)

Essay & mixed assessment engine, tasks E1–E16.

| | |
| --- | --- |
| Suite | `apps/api/test/e2e/sprint9-final-audit.e2e-spec.ts` |
| Run | `pnpm --filter api test:e2e` (needs an isolated `*_test` PostgreSQL database, migrated) |
| Level | Real Nest app over HTTP (supertest) + real PostgreSQL. Every rule is asserted through status codes and database state, never through the UI. |
| Result | **16/16 scenarios pass** (15 audit scenarios + 1 supplement). Whole `test:e2e` run: 49 files, 410 tests, 0 failures. |

## Status vocabulary

The audit text says `GRADED` / `COMPLETED` / `PUBLISHED`. In this codebase
(E1, E13, E14):

| Audit term | Database state | Meaning |
| --- | --- | --- |
| `SUBMITTED` | `SUBMITTING` (internal claim) → result | the submit request; the learner's view goes straight to the result below |
| `NEEDS_GRADING` | `status = NEEDS_GRADING` | at least one essay is `UNGRADED` |
| `GRADED` | `status = GRADED`, `published_at IS NULL` | all essays graded, final score stored, **private** |
| `PUBLISHED` | `status = COMPLETED`, `published_at` set | the learner may see the result |

A pure-MCQ attempt skips the middle: it is `COMPLETED` (published) on submit.
The learner API never reports `GRADED`; it reports `NEEDS_GRADING`.

## Audit matrix

| # | Scenario | Test | Verified at API/DB level | Result |
| --- | --- | --- | --- | --- |
| 1 | Pure MCQ auto-grade | `T01` | submit → `COMPLETED`, score 100, `isPassed`, `published_at` set, result visible | PASS |
| 2 | Pure essay pending | `T02` | `NEEDS_GRADING`; `score`/`isPassed`/`percentage` `null`; every essay row `UNGRADED` | PASS |
| 3 | Mixed quiz pending | `T03` | MCQ rows graded (`is_correct`, 10 pts each), `earned_points = 20/30` stored internally, learner sees `null`, status `NEEDS_GRADING` | PASS |
| 4 | Partial essay grading | `T04` | 2 of 3 essays graded → `remainingUngradedCount = 1`, status stays `NEEDS_GRADING`, learner still sees no score | PASS |
| 5 | All essays graded | `T05` | last essay → `GRADED`; 10 + 7 + 8 = 25/30, 83.33 %, `isPassed`; `published_at` still `NULL` | PASS |
| 6 | Essay autosave persistence | `T06` | burst of PATCH drafts → exactly one `attempt_answers` row per question holding the latest text and both attachments; attempt stays `IN_PROGRESS`, ungraded | PASS |
| 7 | Reload / second device restore | `T07` | `active-attempt` and `GET /quiz-attempts/:id` from a fresh login return the full essay (text + attachments) and the MCQ selection; submitting with no payload grades exactly the restored draft | PASS |
| 8 | Course instructor may grade | `T08` | 200; grading JSON `GRADED`, `awardedPoints = 4`, `gradedBy` = instructor | PASS |
| 9 | Cross-instructor denied | `T09` | 403 on `grade`, attempt detail, `grade-history`, `publish`, `publish-results`, and `grading-queue?courseId=`; queue never lists the attempt; database untouched | PASS |
| 10 | Student cannot grade/forge | `T10` | 403 on `grade`, `publish`, `grade-history`, queue; 401 without a session; client-sent `score`/`isPassed`/… ignored; drafts after submit → 409; stored answer and status unchanged | PASS |
| 11 | Score limits | `T11` | `6/5` → 400 with `Awarded points (6) exceeds maximum allowed score (5)`; `-1`, `2.5`, client-supplied `maxScore`, unknown question → 400; batch is all-or-nothing; boundaries `0` and `5` accepted | PASS |
| 12 | Pre-publish concealment | `T12` | `GRADED` attempt: learner sees status `NEEDS_GRADING`, message *Submitted. Waiting for instructor to publish results.*; none of feedback, explanation, `isPassed:true`, any numeric score/percentage, `breakdown`, `isCorrect:true`, nor the word `GRADED` appears in result, attempt view, `/result`, `/student-result` or `/my-quiz-attempts` | PASS |
| 13 | Post-publish visibility | `T13` | after publish: score 19/20, 95 %, pass, breakdown (MCQ/essay/total), per-essay feedback; `AFTER_SUBMIT` shows key + explanation; `NEVER` shows score and feedback but no key, no explanation | PASS |
| 14 | Grade adjustment audit trail | `T14` | published attempt: adjusting without reason → 400 (exact message); with reason → one `quiz_grade_audit_logs` row (`3→8`, `adjusted_by`, reason, `was_published`), final score recalculated 23→28/30 and pass flag flips; learner sees `adjustment`; UPDATE/DELETE on the log rejected by trigger; history API returns who/what/why | PASS |
| 15 | Old quiz version stability | `T15` | v1 attempt, quiz edited to v2 (essay 5 → 20 pts): grading v1 above 5 → 400, award 5 → total 15/15 (snapshot scale); instructor view shows v1 text/points; a fresh v2 attempt is graded on the 30-point scale — both coexist | PASS |
| S1 | State machine rigidity (supplement) | `S1` | direct SQL attempts at `NEEDS_GRADING→COMPLETED`, `→IN_PROGRESS`, `GRADED→NEEDS_GRADING`, `COMPLETED→GRADED` are all rejected by the database; publish is idempotent; publishing an ungraded attempt → 409 | PASS |

## Defects found by the audit

No product defect. The audit did surface three **stale tests** in the
`*.e2e-spec.ts` family, which the default `pnpm test` does not run (only
`pnpm test:e2e` does), so they had silently drifted:

| File | Drift | Fix |
| --- | --- | --- |
| `test/e2e/quiz-engine-mvp-lifecycle.e2e-spec.ts` | expected the legacy `SUBMITTED` after submit; the engine now closes as `COMPLETED` | expectation updated (4 tests) |
| `test/e2e/quiz-security-audit.e2e-spec.ts` | same legacy status in a late-submit branch | expectation updated |
| `test/courses.e2e-spec.ts` | public course detail gained `accessType`, `price`, `currency` in the payment sprint | key list updated |

## Residual risks and gaps

* **Browser E2E not executed.** `apps/web/e2e/essay-assessment-ui.spec.ts`
  (Playwright, desktop 1440 px + mobile 375 px, offline/500 handling) is
  written but needs a running web + API stack, a seeded essay quiz
  (`E2E_ESSAY_QUIZ_SLUG`) and, for the instructor checks, staff credentials.
  Its logic is covered at component level by Vitest (autosave, offline
  restore, tabs, skeletons), but not yet in a real browser.
* **Cloudinary not exercised live.** Signing and URL allow-listing are unit and
  integration tested; the browser → Cloudinary upload itself needs the real
  account's key permissions (`create`).
* **Flaky, unrelated:** `test/modules/payment/order-snapshot.spec.ts` ›
  *retries a fresh code on collision* occasionally fails in a full run on a
  long-lived test database (it builds a 4-character order code and counts rows
  globally) and passes when run alone. It does not touch Sprint 9.
* **Web unit test failing before Sprint 9:**
  `admin-orders/no-status-override.test.ts` matches a `/api.ts` path and fails
  on Windows path separators.
* **Whole-number points only.** Essay points are stored as integers
  (`points_earned smallint`), so half-points cannot be awarded.
* **Reason visibility to learners** is a code constant
  (`SHOW_ADJUSTMENT_REASON_TO_LEARNER`), not per-quiz configuration.
