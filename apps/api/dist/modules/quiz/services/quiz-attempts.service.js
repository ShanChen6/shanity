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
import { QuizLearnerAccessService, quizForbidden, } from './quiz-learner-access.service.js';
const ATTEMPT_COLUMNS = `id, user_id AS "userId", quiz_id AS "quizId",
  attempt_number AS "attemptNumber", quiz_snapshot AS "quizSnapshot", status,
  started_at AS "startedAt", expires_at AS "expiresAt",
  submitted_at AS "submittedAt", score, is_passed AS "isPassed",
  (expires_at IS NOT NULL AND clock_timestamp() >= expires_at) AS expired,
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
            const active = await this.lockActive(manager, principal.id, quizId);
            if (active && !active.expired)
                return { created: false, attempt: await this.view(manager, active) };
            if (active)
                await this.close(manager, active, QuizAttemptStatus.TIMED_OUT);
            const quiz = await this.access.loadPublishedQuiz(quizId, manager);
            const [{ used }] = await manager.query(`SELECT count(*)::int AS used FROM quiz_attempts
         WHERE user_id = $1 AND quiz_id = $2`, [principal.id, quizId]);
            if (quiz.maxAttempts !== null && used >= quiz.maxAttempts)
                return { rejected: 'MAX_ATTEMPTS_EXCEEDED' };
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
        if ('rejected' in result) {
            if (result.rejected === 'MAX_ATTEMPTS_EXCEEDED')
                throw quizForbidden(result.rejected);
            throw new ConflictException({
                statusCode: 409,
                ...error(result.rejected),
            });
        }
        return result;
    }
    async activeAttempt(principal, quizId) {
        await this.access.assertCanTake(principal, await this.access.loadQuiz(quizId));
        const attempt = await this.transaction(async (manager) => {
            const active = await this.lockActive(manager, principal.id, quizId);
            if (!active)
                return null;
            if (active.expired)
                return this.close(manager, active, QuizAttemptStatus.TIMED_OUT);
            return this.view(manager, active);
        });
        if (!attempt)
            throw new NotFoundException({
                statusCode: 404,
                ...error('NO_ACTIVE_ATTEMPT'),
            });
        return attempt;
    }
    async saveAnswer(principal, attemptId, answer) {
        await this.assertOwnAttempt(principal, attemptId);
        const result = await this.transaction(async (manager) => {
            const attempt = await this.lockAttempt(manager, attemptId);
            if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
                return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
            if (attempt.expired) {
                await this.close(manager, attempt, QuizAttemptStatus.TIMED_OUT);
                return { rejected: 'ATTEMPT_EXPIRED' };
            }
            this.assertAnswerFitsSnapshot(attempt, answer);
            const [saved] = await manager.query(`INSERT INTO attempt_answers(attempt_id, question_id, selected_option_ids, saved_at)
         VALUES ($1, $2, $3::uuid[], clock_timestamp())
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option_ids = EXCLUDED.selected_option_ids,
               saved_at = EXCLUDED.saved_at
         RETURNING question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"`, [attemptId, answer.questionId, answer.selectedOptionIds]);
            return { saved: saved };
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
        const result = await this.transaction(async (manager) => {
            const attempt = await this.lockAttempt(manager, attemptId);
            if (attempt.status === QuizAttemptStatus.ABANDONED)
                return null;
            if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
                return this.view(manager, attempt);
            return this.close(manager, attempt, attempt.expired
                ? QuizAttemptStatus.TIMED_OUT
                : QuizAttemptStatus.SUBMITTED);
        });
        if (!result)
            throw new ConflictException({
                statusCode: 409,
                ...error('ATTEMPT_NOT_IN_PROGRESS'),
            });
        return result;
    }
    async assertOwnAttempt(principal, attemptId) {
        const [owner] = await this.dataSource.query('SELECT user_id AS "userId", quiz_id AS "quizId" FROM quiz_attempts WHERE id = $1', [attemptId]);
        if (!owner || owner.userId !== principal.id)
            throw new NotFoundException(ATTEMPT_NOT_FOUND);
        await this.access.assertCanTake(principal, await this.access.loadQuiz(owner.quizId));
    }
    assertAnswerFitsSnapshot(attempt, { questionId, selectedOptionIds }) {
        const question = attempt.quizSnapshot.questions.find(({ id }) => id === questionId);
        if (!question)
            throw new BadRequestException({
                statusCode: 400,
                ...error('QUESTION_NOT_IN_SNAPSHOT'),
            });
        const optionIds = new Set(question.options.map(({ id }) => id));
        if (!selectedOptionIds.every((id) => optionIds.has(id)))
            throw new BadRequestException({
                statusCode: 400,
                ...error('OPTION_NOT_IN_QUESTION'),
            });
        if (question.type === QuizQuestionType.SINGLE_CHOICE &&
            selectedOptionIds.length > 1)
            throw new BadRequestException({
                statusCode: 400,
                ...error('INVALID_RESPONSE_TYPE'),
            });
    }
    async lockActive(manager, userId, quizId) {
        const [attempt] = await manager.query(`SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2 AND status = 'IN_PROGRESS'
       FOR UPDATE`, [userId, quizId]);
        return attempt ?? null;
    }
    async lockAttempt(manager, attemptId) {
        const [attempt] = await manager.query(`SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE id = $1 FOR UPDATE`, [attemptId]);
        if (!attempt)
            throw new NotFoundException(ATTEMPT_NOT_FOUND);
        return attempt;
    }
    async close(manager, attempt, status) {
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
           THEN LEAST(expires_at, clock_timestamp()) ELSE clock_timestamp() END,
         score = $3, is_passed = $4
       WHERE id = $1
       RETURNING ${ATTEMPT_COLUMNS}`, [attempt.id, status, grade.score, grade.isPassed]);
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
//# sourceMappingURL=quiz-attempts.service.js.map