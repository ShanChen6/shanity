# Sprint 9 E1 - Quiz Domain Audit & Multi-modal Assessment Specification

Status: **Accepted for E2-E4 implementation**  
Scope: architecture and contracts only; no runtime schema migration is part of E1.  
Decision record: [ADR Sprint 9 Essay Extension](./adr-sprint9-essay-extension.md)

## 1. Executive decision

Extend the Sprint 7 Quiz aggregate in place. Do not create `essay_questions`,
`essay_answers`, or a second submission/timer engine. Add nullable JSONB columns
to the existing `quiz_questions` and `attempt_answers` tables, add `ESSAY` to the
existing question enum, freeze essay configuration into `quiz_attempts.quiz_snapshot`,
and extend the existing submission pipeline with manual grading.

The canonical lifecycle is `IN_PROGRESS -> SUBMITTING -> COMPLETED` for an
objective-only attempt and `IN_PROGRESS -> SUBMITTING -> NEEDS_GRADING -> COMPLETED`
for an attempt containing Essay. `PASSED` and `FAILED` are result labels derived
from `is_passed` after completion; they are not lifecycle states.

## 2. Sprint 7 code and database audit

The repository uses more specific physical names than the task's generic names:
`Question` is `QuizQuestionEntity` / `quiz_questions`, and `QuizAnswer` is
`AttemptAnswerEntity` / `attempt_answers`.

| Aggregate/table                           | Current contract                                                                                                  | Relevant invariant                                                             | Sprint 9 gap                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `QuizEntity` / `quizzes`                  | Scope, target, publishing state, pass threshold, attempts, timer, review/grading policies, shuffle flags, version | One Quiz is the execution container for all questions                          | No new Quiz aggregate is needed                                |
| `QuizQuestionEntity` / `quiz_questions`   | `SINGLE_CHOICE` or `MULTIPLE_CHOICE`, HTML content, position, positive points, explanation                        | Owned by Quiz; options cascade; authoring only in `DRAFT`                      | No `ESSAY` discriminator or essay configuration                |
| `QuizOptionEntity` / `quiz_options`       | Option content, position and server-only `is_correct` key                                                         | Choice questions require valid option/key cardinality                          | Essay must have zero options and bypass choice-only validation |
| `QuizAttemptEntity` / `quiz_attempts`     | User/Quiz identity, immutable `quiz_snapshot` JSONB, timer, status, total result                                  | One active attempt per user/Quiz; snapshot isolates execution from later edits | Current state model assumes immediate auto-grading             |
| `AttemptAnswerEntity` / `attempt_answers` | Snapshot `question_id`, selected option UUIDs, correctness, points                                                | One row per attempt/question; answer writes stop after submission              | Cannot store text/files, pending grading or grader audit       |

### 2.1 Existing lifecycle and grading implementation

`QuizAttemptStatus` currently contains `IN_PROGRESS`, `SUBMITTING`, `SUBMITTED`,
`TIMED_OUT`, and `ABANDONED`. `SUBMITTING` is a durable lease used to make submit
idempotent. `gradeAttempt()` reads only the frozen snapshot and selected option
IDs, computes all question scores immediately, then writes final attempt totals.
Database triggers freeze answers outside `IN_PROGRESS`, except objective grading
annotations while `SUBMITTING`.

This machinery should be retained. E2/E3 must generalize the trigger and service
guards so instructor grading is allowed only in `NEEDS_GRADING`, while learner
answers remain immutable.

### 2.2 Snapshot and security findings

- `quiz_attempts.quiz_snapshot` is already the correct isolation boundary. An
  Essay rubric must be copied into the snapshot and grading must use that copy,
  never the mutable authoring row.
- Learner DTOs use allow-lists, which reduces accidental disclosure. Rubrics,
  grading audit data and answer keys still require explicit response policies.
- The current snapshot schema is version `1`. The Essay extension requires
  schema version `2`, while readers must continue accepting version `1`.
- Current structural validation applies option rules to every question. It must
  dispatch by discriminator: choice questions require options; Essay requires
  zero options and a valid `essayConfig`.
- `points_earned` is `smallint`; `QuizQuestion.points` is also `smallint`. Rubric
  and awarded score validation must honor this bound unless a later migration
  deliberately changes both.

## 3. Storage options

### Option A - Single table plus nullable JSONB columns (selected)

Add type-specific fields to the existing tables:

```text
quiz_questions.essay_config  jsonb null
attempt_answers.essay_answer jsonb null
attempt_answers.grading      jsonb null
```

Advantages: preserves aggregate identity and all timer/submission/history paths;
additive migration with no data rewrite; old choice rows stay valid with null
columns; JSONB handles evolving rubric and attachment metadata; one answer row
remains the concurrency boundary. Costs: application validation is mandatory,
cross-field checks are less expressive in SQL, and analytics over nested rubric
data is less convenient. Targeted JSON-path indexes should be added only after a
measured query need, not pre-emptively.

### Option B - Class-table inheritance / polymorphic extension tables

`essay_question_details` and `essay_answer_details` would provide stronger SQL
typing for Essay and keep the base rows narrow. However, every read/write/grade
path gains joins and dual-row transactional invariants; future Audio and Code
modalities tend to add another table each; cascades, snapshot construction and
submission idempotency become harder. It is justified only if Essay develops a
large independently queried relational model. That evidence does not exist.

### Option C - Entity-Attribute-Value

EAV can add arbitrary attributes without DDL, but loses useful PostgreSQL types,
constraints and discoverability. It requires many rows/joins per answer, makes
atomic replacement and versioned validation difficult, and is hostile to
TypeORM mapping. EAV is rejected for core assessment data.

### Decision matrix

| Criterion                          |    Option A | Option B | Option C |
| ---------------------------------- | ----------: | -------: | -------: |
| Reuse existing Quiz/Attempt engine |        High |   Medium |      Low |
| Zero-downtime additive migration   |        High |   Medium |     High |
| Type/invariant clarity             | Medium-High |     High |      Low |
| Future modality flexibility        |        High |   Medium |     High |
| Query and operational simplicity   |        High |   Medium |      Low |

Option A best satisfies Zero Duplicate System and the current workload.

## 4. Target persistence model

### 4.1 Question discriminator

The existing enum must be extended, not replaced:

```ts
enum QuestionType {
  SINGLE_CHOICE = "SINGLE_CHOICE", // Sprint 7 compatibility
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
  ESSAY = "ESSAY",
}
```

The reusable TypeScript contracts are in
`apps/api/src/modules/quiz/domain/assessment.types.ts`.

The corresponding TypeORM column contract is additive:

```ts
// QuizQuestionEntity
@Column({ name: 'essay_config', type: 'jsonb', nullable: true })
essayConfig: EssayConfig | null;

// AttemptAnswerEntity
@Column({ name: 'essay_answer', type: 'jsonb', nullable: true })
essayAnswer: EssayAnswer | null;

@Column({ type: 'jsonb', nullable: true })
grading: EssayGradingJson | null;
```

These are target declarations for E2, not columns already present in Sprint 7.

### 4.2 `quiz_questions.essay_config JSONB`

```ts
interface EssayConfig {
  allowedSubmissionTypes: Array<"TEXT_WITH_KATEX" | "FILE_UPLOAD">;
  maxFileUploads: number;
  maxWords?: number;
  rubric: Array<{
    criterion: string;
    maxPoints: number;
    description?: string;
  }>;
}
```

Invariants:

- `ESSAY` requires a non-null object; choice types require null.
- `allowedSubmissionTypes` is non-empty, unique and contains only known values.
- `maxFileUploads` is an integer `>= 0`; it is `0` when `FILE_UPLOAD` is absent,
  and positive within the platform upload cap when it is present.
- `maxWords`, when present, is a positive integer.
- Rubric criterion text is nonblank, `maxPoints > 0`, and rubric total equals
  `QuizQuestion.points`. Criterion order is semantic and therefore immutable in
  an attempt snapshot.
- Essay has no `quiz_options` rows. KaTeX source is content, not executable HTML;
  rendering must use a safe KaTeX configuration and the existing sanitizer.

### 4.3 `attempt_answers.essay_answer JSONB`

```ts
interface EssayAnswer {
  text: string;
  attachments: Array<{
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}
```

Invariants:

- Essay requires `essay_answer`; choice requires it to be null and continues to
  use `selected_option_ids`.
- At least one allowed modality is actually supplied unless blank answers are
  intentionally accepted as zero by product policy.
- Word count and attachment count come from the frozen `essayConfig`.
- Server-side upload finalization verifies ownership, actual MIME signature,
  size, malware policy and object existence. `url` must be a durable storage
  identifier/logical URL, never an expiring signed download URL.
- Accepted initial file types are image/PDF only and are configured server-side;
  client MIME/filename values are untrusted display metadata.

### 4.4 `attempt_answers.grading JSONB`

Use a discriminated union rather than placing fake audit values on an ungraded
answer:

```ts
type EssayGrading =
  | { status: "UNGRADED" }
  | {
      status: "GRADED";
      awardedPoints: number;
      rubricScores: Array<{ criterionIndex: number; score: number }>;
      feedback: string;
      gradedBy: string;
      gradedAt: Date;
    };
```

At the JSONB boundary, `gradedAt` is an ISO-8601 string because JSON does not
preserve JavaScript `Date`; hydrate it to `Date` in the domain/DTO layer.

Grading invariants:

- Before submit, grading may be null; submission initializes each Essay answer
  to `{ status: 'UNGRADED' }` before entering `NEEDS_GRADING`.
- `gradedBy` is the authenticated instructor/admin ID, never client-selected.
- `awardedPoints` is within `0..snapshotQuestion.points`.
- `criterionIndex` is unique, in range, and references the snapshot rubric.
- Each score is within `0..criterion.maxPoints`; all criteria are present; the
  score sum equals `awardedPoints`.
- A grading command locks the attempt/answer, records grader and database time,
  and is idempotent or uses an optimistic version to prevent lost updates.

### 4.5 Recommended SQL checks

Keep deep semantic validation in a versioned application schema (for example
Zod/class-validator plus service invariants). Add cheap database checks:

```sql
CHECK (essay_config IS NULL OR jsonb_typeof(essay_config) = 'object')
CHECK (essay_answer IS NULL OR jsonb_typeof(essay_answer) = 'object')
CHECK (grading IS NULL OR jsonb_typeof(grading) = 'object')
```

After enum migration, add discriminator checks as `NOT VALID`, validate them in
a later deployment, then enforce them. Avoid a single complex SQL function that
duplicates the complete versioned JSON contract.

## 5. Mixed grading state machine

```mermaid
stateDiagram-v2
    [*] --> IN_PROGRESS
    IN_PROGRESS --> SUBMITTING: submit / timeout claim
    SUBMITTING --> COMPLETED: choice-only; auto-grade all
    SUBMITTING --> NEEDS_GRADING: any Essay; auto-grade choice answers
    NEEDS_GRADING --> COMPLETED: all Essay answers graded
    IN_PROGRESS --> ABANDONED
```

On mixed submission, objective answers receive their final score immediately;
Essay answers remain `UNGRADED`. Attempt totals may expose an explicitly named
provisional objective subtotal, but `score`, `percentage`, and `isPassed` remain
null until every Essay answer is graded. The finalization transaction sums both
objective and Essay points, computes the percentage once using the existing
round-half-up rule, sets `isPassed`, and changes status to `COMPLETED`.

`TIMED_OUT` is a submission reason, not a grading outcome. During compatibility
migration, legacy `SUBMITTED`/`TIMED_OUT` rows are treated as completed. New code
should preserve timeout as `completionReason = USER_SUBMIT | TIMEOUT` (or an
equivalent timestamp/reason field) rather than overloading lifecycle status.

| Attempt contents  | Immediately after submit              | Final state                        |
| ----------------- | ------------------------------------- | ---------------------------------- |
| Choice only       | Auto-grade all                        | `COMPLETED`, `isPassed` true/false |
| Contains Essay    | Auto-grade choices; Essays `UNGRADED` | `NEEDS_GRADING`                    |
| All Essays graded | Recompute once from snapshot          | `COMPLETED`, `isPassed` true/false |

Progress, certificate gates, review policy and official attempt selection must
consider only completed attempts. `NEEDS_GRADING` must consume an attempt but
must not count as pass/fail.

## 6. Zero-downtime migration plan for E2-E4

1. **Expand:** add nullable JSONB columns; extend PostgreSQL enums safely; add
   new lifecycle values; deploy readers that accept snapshot v1 and v2.
2. **Dual-compatible application:** author and snapshot Essay as v2; choice-only
   behavior remains byte-for-byte compatible. Treat legacy terminal statuses as
   completed in queries and progress calculations.
3. **Mixed grading:** deploy Essay save/upload and instructor grading commands;
   adjust triggers to permit only grading fields during `NEEDS_GRADING`.
4. **Backfill/normalize if required:** no JSON backfill is needed for choice
   data. A later small batch may normalize old terminal lifecycle values only
   after every reader supports `COMPLETED`.
5. **Contract:** validate new constraints, update partial active-attempt indexes,
   then remove legacy status handling in a separate release.

PostgreSQL enum changes and table constraints must follow the repository's
transactional migration conventions. Do not combine an enum value addition with
its first use if the deployed PostgreSQL/versioning strategy cannot do so safely;
the existing Sprint 7 migration rebuilds enums for this reason.

## 7. Service/API boundaries for later tasks

- `AssessmentResponseValidator`: dispatch validation by snapshot question type.
- `ObjectiveGrader`: retain deterministic Sprint 7 exact-set grading.
- `EssayGradingService`: authorize instructor, validate rubric scores against
  snapshot v2, lock rows, and finalize when no `UNGRADED` Essay remains.
- `AttemptFinalizer`: the single owner of total/percentage/pass computation and
  progress invalidation; both auto and manual paths call it.
- `AttachmentService`: create/finalize uploads and return durable metadata;
  downloads are authorized and signed at read time.
- Learner result DTOs must not expose rubric scores, grader IDs or feedback until
  the attempt is completed and its frozen review policy permits details.

Suggested commands are replace-style and idempotent: save an Essay answer while
`IN_PROGRESS`, submit the existing attempt, grade one Essay answer, and fetch the
grading queue/result. None creates a second attempt or submission model.

## 8. Future modalities

Audio and Code should reuse the same Question -> Snapshot -> AttemptAnswer ->
Grading pipeline and discriminator dispatch. Their payload contracts should be
versioned JSONB envelopes and attachment references should reuse the media
service. Audio may add recording duration/language/transcript policy; Code may
add language, test-set version and runner result. A sandboxed code runner is an
external grading adapter and stores only immutable result/audit data in Quiz.

If three or more modalities accumulate many unrelated top-level columns, a
future additive migration may introduce generic `question_config`,
`answer_payload`, and `grading_payload` JSONB envelopes. That is a naming
normalization, not a new Quiz/Attempt system, and existing Essay columns remain
readable during transition.

## 9. Acceptance gates for E2-E4

- Existing Sprint 7 MCQ tests continue to pass without data conversion.
- A mixed Quiz shares the same start/resume/timer/submit endpoints and attempt ID.
- Snapshot v2 fully freezes Essay config/rubric and v1 attempts remain readable.
- Choice-only submit finalizes synchronously; mixed submit becomes
  `NEEDS_GRADING`; final Essay grade atomically produces `COMPLETED`.
- Concurrent submit and concurrent grading are retry-safe with no double progress
  invalidation or lost rubric score.
- Learners cannot mutate after submit or grade; instructors cannot change answer
  content; unauthorized users cannot read attachments or grading audit data.
- Progress and certificates ignore `NEEDS_GRADING` and honor only final results.
