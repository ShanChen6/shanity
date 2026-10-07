var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LearnerAttemptAnswerResponseDto, LearnerAttemptResponseDto, } from '../dto/quiz-attempt.dto.js';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { buildQuizSnapshot, secureShuffle, } from './quiz-attempt-snapshot.js';
import { QuizCourseResolverService, QuizTargetNotFoundError, } from './quiz-course-resolver.service.js';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import { gradeAttempt } from './quiz-grading.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
import { buildAttemptResult } from '../dto/quiz-attempt-result.dto.js';
import { isReviewAllowed } from './quiz-review-policy.js';
export const GRACE_PERIOD_SECONDS = 5;
export const SUBMISSION_LEASE_SECONDS = 30;
const ATTEMPT_COLUMNS = `id, user_id AS "userId", quiz_id AS "quizId",
  attempt_number AS "attemptNumber", quiz_snapshot AS "quizSnapshot", status,
  started_at AS "startedAt", expires_at AS "expiresAt",
  submitted_at AS "submittedAt", score, is_passed AS "isPassed",
  earned_points AS "earnedPoints", total_points AS "totalPoints",
  percentage::float8 AS percentage,
  (expires_at IS NOT NULL AND clock_timestamp() > expires_at) AS expired,
  updated_at::text AS "submissionToken",
  (clock_timestamp() > updated_at
    + make_interval(secs => ${SUBMISSION_LEASE_SECONDS})) AS "leaseExpired",
  (expires_at IS NOT NULL AND clock_timestamp()
    > expires_at + make_interval(secs => ${GRACE_PERIOD_SECONDS}))
    AS "pastGrace",
  clock_timestamp() AS "serverNow"`;
const error = (code) => ({ message: code, code });
const ATTEMPT_NOT_FOUND = { statusCode: 404, ...error('ATTEMPT_NOT_FOUND') };
let QuizAttemptsService = class QuizAttemptsService {
    dataSource;
    access;
    resolver;
    progress;
    shuffle = secureShuffle;
    closedIn = new WeakMap();
    constructor(dataSource, access, resolver, progress) {
        this.dataSource = dataSource;
        this.access = access;
        this.resolver = resolver;
        this.progress = progress;
    }
    async transaction(work) {
        const closed = [];
        const result = await this.dataSource.transaction((manager) => {
            this.closedIn.set(manager, closed);
            return work(manager);
        });
        for (const { userId, courseId } of closed)
            await this.progress.invalidateStudentProgress(userId, courseId);
        return result;
    }
    async start(principal, quizId) {
        await this.access.assertCanTake(principal, await this.access.loadPublishedQuiz(quizId));
        const result = await this.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`quiz-attempt:${principal.id}:${quizId}`]);
            const quiz = await this.access.loadPublishedQuiz(quizId, manager, true);
            const active = await this.lockActive(manager, principal.id, quizId);
            if (active?.status === QuizAttemptStatus.SUBMITTING &&
                !(await this.settleStaleSubmission(manager, active)))
                return { rejected: 'SUBMISSION_IN_PROGRESS' };
            if (active?.status === QuizAttemptStatus.IN_PROGRESS &&
                !(await this.checkAndEnforceTimeout(manager, active)))
                return { created: false, attempt: await this.view(manager, active) };
            const used = (await manager.query(`SELECT id FROM quiz_attempts
             WHERE user_id = $1 AND quiz_id = $2 FOR UPDATE`, [principal.id, quizId])).length;
            if (quiz.maxAttempts !== null && used >= quiz.maxAttempts)
                return { rejected: 'MAX_ATTEMPTS_REACHED' };
            const questions = await manager.getRepository(QuizQuestionEntity).find({
                where: { quizId },
                relations: { options: true },
            });
            if (!questions.length)
                return { rejected: 'QUIZ_HAS_NO_QUESTIONS' };
            const snapshot = buildQuizSnapshot(quiz, await this.courseIdOf(quiz), questions, this.shuffle);
            const [created] = await manager.query(`WITH clock AS (SELECT clock_timestamp() AS at)
         INSERT INTO quiz_attempts(user_id, quiz_id, quiz_version,
           attempt_number, quiz_snapshot, started_at, expires_at)
         SELECT $1, $2, $3, $4, $5::jsonb, clock.at,
           clock.at + make_interval(mins => $6::int)
         FROM clock
         RETURNING ${ATTEMPT_COLUMNS}`, [
                principal.id,
                quizId,
                quiz.version,
                used + 1,
                JSON.stringify(snapshot),
                quiz.durationMinutes,
            ]);
            return { created: true, attempt: await this.view(manager, created) };
        });
        if ('rejected' in result)
            throw new ConflictException({
                statusCode: 409,
                ...error(result.rejected),
            });
        return result;
    }
    async activeAttempt(principal, quizId) {
        await this.access.assertCanTake(principal, await this.access.loadQuiz(quizId));
        const attempt = await this.transaction(async (manager) => {
            const active = await this.lockActive(manager, principal.id, quizId);
            if (!active)
                return null;
            return ((await this.settleStaleSubmission(manager, active)) ??
                (await this.checkAndEnforceTimeout(manager, active)) ??
                this.view(manager, active));
        });
        if (!attempt)
            throw new NotFoundException({
                statusCode: 404,
                ...error('NO_ACTIVE_ATTEMPT'),
            });
        return attempt;
    }
    async saveAnswer(principal, attemptId, answer) {
        const selected = selectionOf(answer);
        await this.assertOwnAttempt(principal, attemptId);
        const result = await this.transaction(async (manager) => {
            const attempt = await this.lockAttempt(manager, attemptId);
            if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
                return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
            const timedOut = await this.checkAndEnforceTimeout(manager, attempt);
            if (timedOut)
                return { timedOut };
            assertAnswerFitsSnapshot(attempt, answer.questionId, selected);
            const [saved] = await manager.query(`INSERT INTO attempt_answers(attempt_id, question_id, selected_option_ids, saved_at)
         VALUES ($1, $2, $3::uuid[], clock_timestamp())
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option_ids = EXCLUDED.selected_option_ids,
               saved_at = EXCLUDED.saved_at
         RETURNING question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"`, [attemptId, answer.questionId, selected]);
            return { saved: saved };
        });
        if ('timedOut' in result)
            throw new BadRequestException({
                statusCode: 400,
                ...error('ATTEMPT_EXPIRED'),
                notice: 'ATTEMPT_TIMED_OUT',
                attempt: result.timedOut,
            });
        if ('rejected' in result)
            throw new ConflictException({
                statusCode: 409,
                ...error(result.rejected),
            });
        return LearnerAttemptAnswerResponseDto.from(result.saved);
    }
    async submit(principal, attemptId) {
        await this.assertOwnAttempt(principal, attemptId);
        const claim = await this.transaction(async (manager) => {
            const attempt = await this.lockAttempt(manager, attemptId);
            switch (attempt.status) {
                case QuizAttemptStatus.SUBMITTED:
                case QuizAttemptStatus.TIMED_OUT:
                    return { done: await this.view(manager, attempt) };
                case QuizAttemptStatus.ABANDONED:
                    return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
                case QuizAttemptStatus.SUBMITTING:
                    if (!attempt.leaseExpired)
                        return { rejected: 'SUBMISSION_IN_PROGRESS' };
                    return {
                        token: await this.claim(manager, attempt.id),
                        submittedAt: attempt.submissionToken,
                    };
                default: {
                    const timedOut = await this.checkAndEnforceTimeout(manager, attempt, true);
                    if (timedOut)
                        return { done: timedOut };
                    const token = await this.claim(manager, attempt.id);
                    return { token, submittedAt: token };
                }
            }
        });
        if ('rejected' in claim)
            throw new ConflictException({
                statusCode: 409,
                ...error(claim.rejected),
            });
        if ('done' in claim)
            return claim.done;
        return this.transaction(async (manager) => {
            const attempt = await this.lockAttempt(manager, attemptId);
            if (attempt.status !== QuizAttemptStatus.SUBMITTING ||
                attempt.submissionToken !== claim.token)
                return this.view(manager, attempt);
            return this.gradeAndClose(manager, attempt, QuizAttemptStatus.SUBMITTED, claim.submittedAt);
        });
    }
    async result(principal, attemptId) {
        await this.assertOwnAttempt(principal, attemptId);
        const result = await this.transaction(async (manager) => {
            let attempt = await this.lockAttempt(manager, attemptId);
            if ((await this.settleStaleSubmission(manager, attempt)) ||
                (await this.checkAndEnforceTimeout(manager, attempt)))
                attempt = await this.lockAttempt(manager, attemptId);
            if (attempt.status === QuizAttemptStatus.SUBMITTING)
                return { rejected: 'SUBMISSION_IN_PROGRESS' };
            if (attempt.status !== QuizAttemptStatus.SUBMITTED &&
                attempt.status !== QuizAttemptStatus.TIMED_OUT)
                return { rejected: 'ATTEMPT_NOT_SUBMITTED' };
            const answers = await manager.query(`SELECT question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds",
           is_correct AS "isCorrect", points_earned AS "pointsEarned"
         FROM attempt_answers WHERE attempt_id = $1`, [attempt.id]);
            const [history] = await manager.query(`SELECT count(*)::int AS "attemptsUsed",
           coalesce(bool_or(status IN ('IN_PROGRESS', 'SUBMITTING')), false)
             AS "hasOpenAttempt"
         FROM quiz_attempts WHERE user_id = $1 AND quiz_id = $2`, [attempt.userId, attempt.quizId]);
            return {
                result: buildAttemptResult(attempt, answers, isReviewAllowed(attempt.quizSnapshot.quiz, attempt, history)),
            };
        });
        if ('rejected' in result)
            throw new ConflictException({
                statusCode: 409,
                ...error(result.rejected),
            });
        return result.result;
    }
    async claim(manager, attemptId) {
        const [[row]] = await manager.query(`UPDATE quiz_attempts SET status = 'SUBMITTING'
       WHERE id = $1 RETURNING updated_at::text AS token`, [attemptId]);
        return row.token;
    }
    async settleStaleSubmission(manager, attempt) {
        if (attempt.status !== QuizAttemptStatus.SUBMITTING)
            return null;
        if (!attempt.leaseExpired)
            return null;
        return this.gradeAndClose(manager, attempt, QuizAttemptStatus.SUBMITTED, attempt.submissionToken);
    }
    async checkAndEnforceTimeout(manager, attempt, grace = false) {
        if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
            return null;
        if (!(grace ? attempt.pastGrace : attempt.expired))
            return null;
        return this.gradeAndClose(manager, attempt, QuizAttemptStatus.TIMED_OUT);
    }
    async assertOwnAttempt(principal, attemptId) {
        const [owner] = await this.dataSource.query('SELECT user_id AS "userId", quiz_id AS "quizId" FROM quiz_attempts WHERE id = $1', [attemptId]);
        if (!owner || owner.userId !== principal.id)
            throw new NotFoundException(ATTEMPT_NOT_FOUND);
        await this.access.assertCanTake(principal, await this.access.loadQuiz(owner.quizId));
    }
    async lockActive(manager, userId, quizId) {
        const [attempt] = await manager.query(`SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2
         AND status IN ('IN_PROGRESS', 'SUBMITTING')
       FOR UPDATE`, [userId, quizId]);
        return attempt ?? null;
    }
    async lockAttempt(manager, attemptId) {
        const [attempt] = await manager.query(`SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE id = $1 FOR UPDATE`, [attemptId]);
        if (!attempt)
            throw new NotFoundException(ATTEMPT_NOT_FOUND);
        return attempt;
    }
    async gradeAndClose(manager, attempt, status, submittedAt = null) {
        const saved = await manager.query(`SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds"
       FROM attempt_answers WHERE attempt_id = $1`, [attempt.id]);
        const grade = gradeAttempt(attempt.quizSnapshot, saved);
        const { courseId } = attempt.quizSnapshot.quiz;
        if (courseId)
            this.closedIn.get(manager)?.push({ userId: attempt.userId, courseId });
        await manager.query(`UPDATE attempt_answers answer
       SET is_correct = graded.is_correct, points_earned = graded.points
       FROM unnest($2::uuid[], $3::boolean[], $4::int[])
         AS graded(question_id, is_correct, points)
       WHERE answer.attempt_id = $1 AND answer.question_id = graded.question_id`, [
            attempt.id,
            grade.answers.map(({ questionId }) => questionId),
            grade.answers.map(({ isCorrect }) => isCorrect),
            grade.answers.map(({ pointsEarned }) => pointsEarned),
        ]);
        const [[closed]] = await manager.query(`UPDATE quiz_attempts
       SET status = $2::"QuizAttemptStatus",
         submitted_at = CASE WHEN $2 = 'TIMED_OUT'
           THEN LEAST(expires_at, clock_timestamp())
           ELSE coalesce($8::timestamptz, clock_timestamp()) END,
         score = $3, is_passed = $4, earned_points = $5, total_points = $6,
         percentage = $7
       WHERE id = $1
       RETURNING ${ATTEMPT_COLUMNS}`, [
            attempt.id,
            status,
            grade.score,
            grade.isPassed,
            grade.earnedPoints,
            grade.totalPoints,
            grade.percentage.toFixed(2),
            submittedAt,
        ]);
        return LearnerAttemptResponseDto.from(closed, null);
    }
    async view(manager, attempt) {
        if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
            return LearnerAttemptResponseDto.from(attempt, null);
        const answers = await manager.query(`SELECT question_id AS "questionId",
         selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"
       FROM attempt_answers WHERE attempt_id = $1 ORDER BY saved_at, question_id`, [attempt.id]);
        return LearnerAttemptResponseDto.from(attempt, answers);
    }
    async courseIdOf(quiz) {
        try {
            return await this.resolver.resolveCourseIdByQuiz(quiz);
        }
        catch (reason) {
            if (reason instanceof QuizTargetNotFoundError)
                return null;
            throw reason;
        }
    }
};
QuizAttemptsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizLearnerAccessService,
        QuizCourseResolverService,
        CourseProgressCalculatorService])
], QuizAttemptsService);
export { QuizAttemptsService };
const invalid = (code) => new BadRequestException({ statusCode: 400, ...error(code) });
function selectionOf({ selectedOptionId, selectedOptionIds, }) {
    if (selectedOptionId !== undefined && selectedOptionIds !== undefined)
        throw invalid('INVALID_RESPONSE_TYPE');
    return selectedOptionIds ?? [selectedOptionId];
}
function assertAnswerFitsSnapshot(attempt, questionId, selected) {
    const question = attempt.quizSnapshot.questions.find(({ id }) => id === questionId);
    if (!question)
        throw invalid('QUESTION_NOT_IN_SNAPSHOT');
    const optionIds = new Set(question.options.map(({ id }) => id));
    if (!selected.every((id) => optionIds.has(id)))
        throw invalid('INVALID_OPTION_FOR_QUESTION');
    if (question.type === QuizQuestionType.SINGLE_CHOICE && selected.length > 1)
        throw invalid('INVALID_RESPONSE_TYPE');
}
//# sourceMappingURL=quiz-attempts.service.js.map