import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Account } from '../support/learning-fixture.js';
import {
  ANSWER_KEYS,
  SCOPES,
  allKeys,
  quizEngine,
  type Course,
} from './quiz-e2e-support.js';

/**
 * Sprint 7 MVP lifecycle, once per scope: author -> publish v1 -> learner
 * discovers, starts, autosaves, reloads, submits -> author edits and
 * publishes v2 -> the v1 attempt is untouched, a new learner gets v2.
 */
describe('Quiz engine MVP lifecycle', () => {
  let e: Awaited<ReturnType<typeof quizEngine>>;
  let instructorA: Account;
  let student1: Account;
  let student2: Account;
  let course: Course;

  beforeAll(async () => {
    e = await quizEngine('quiz-mvp-lifecycle');
    instructorA = await e.account('instructor');
    student1 = await e.account();
    student2 = await e.account();
    course = await e.course(instructorA, 1, [student1, student2]);
  });
  afterAll(() => e?.app.close());

  describe.each(SCOPES)('%s', (scope) => {
    it('runs authoring -> v1 attempt -> resume -> grading -> v2 isolation', async () => {
      const author = e.as(instructorA);
      const learner1 = e.as(student1);
      const learner2 = e.as(student2);

      // 1. Authoring & publishing (Instructor A).
      const quiz = await e.draftQuiz(instructorA, scope, course);
      const draftView = await author('get', `/admin/quizzes/${quiz.id}`).expect(
        200,
      );
      expect(draftView.body).toMatchObject({
        status: 'DRAFT',
        version: 1,
        scope,
      });
      expect(draftView.body.questions).toHaveLength(2);
      // The structure gate: a question that loses its key blocks publishing.
      await author('put', `/admin/options/${quiz.q1.options[0]!.id}`, {
        isCorrect: false,
      }).expect(200);
      const rejected = await author(
        'post',
        `/admin/quizzes/${quiz.id}/publish`,
      ).expect(422);
      expect(rejected.body.issues).toEqual([
        { code: 'QUESTION_MISSING_CORRECT_OPTION', questionId: quiz.q1.id },
      ]);
      await author('put', `/admin/options/${quiz.q1.options[0]!.id}`, {
        isCorrect: true,
      }).expect(200);
      expect(await e.publish(instructorA, quiz.id)).toMatchObject({
        version: 1,
      });

      // 2. Discovery (Student 1).
      if (scope === 'STANDALONE') {
        const list = await learner1(
          'get',
          `/quizzes/standalone?search=${quiz.slug}`,
        ).expect(200);
        expect(list.body.quizzes.map(({ id }: { id: string }) => id)).toEqual([
          quiz.id,
        ]);
        await learner1('get', `/quizzes/standalone/${quiz.slug}`).expect(200);
      } else {
        const list = await learner1(
          'get',
          `/courses/${course.id}/quizzes`,
        ).expect(200);
        expect(list.body.quizzes.map(({ id }: { id: string }) => id)).toContain(
          quiz.id,
        );
      }

      // startAttempt -> the v1 snapshot.
      const started = await learner1(
        'post',
        `/quizzes/${quiz.id}/attempts`,
      ).expect(201);
      const attemptId = started.body.id as string;
      expect(
        started.body.quiz.questions.map(
          ({ content }: { content: string }) => content,
        ),
      ).toEqual(['Q1 v1: TypeScript là gì?', 'Q2 v1: Kiểu nguyên thủy?']);
      for (const key of ANSWER_KEYS)
        expect(allKeys(started.body)).not.toContain(key);
      const [{ quizVersion }] = await e.db.query(
        'SELECT quiz_version AS "quizVersion" FROM quiz_attempts WHERE id = $1',
        [attemptId],
      );
      expect(quizVersion).toBe(1);

      // Autosave some answers.
      await learner1('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: quiz.q1.id,
        selectedOptionId: quiz.q1.options[0]!.id,
      }).expect(200);
      await learner1('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: quiz.q2.id,
        selectedOptionIds: [quiz.q2.options[0]!.id],
      }).expect(200);

      // Disconnect / reload: a brand new session restores everything.
      const reloaded = await e.login(student1.email);
      const resumed = await e
        .http()
        .get(`/quizzes/${quiz.id}/active-attempt`)
        .set('Cookie', reloaded)
        .expect(200);
      expect(resumed.body).toMatchObject({
        id: attemptId,
        status: 'IN_PROGRESS',
        attemptNumber: 1,
        expiresAt: started.body.expiresAt,
      });
      expect(resumed.body.quiz.questions).toEqual(started.body.quiz.questions);
      expect(
        Object.fromEntries(
          resumed.body.answers.map(
            (answer: { questionId: string; selectedOptionIds: string[] }) => [
              answer.questionId,
              answer.selectedOptionIds,
            ],
          ),
        ),
      ).toEqual({
        [quiz.q1.id]: [quiz.q1.options[0]!.id],
        [quiz.q2.id]: [quiz.q2.options[0]!.id],
      });

      // Submit -> auto-grading: Q1 right (10), Q2 half-picked (0) = 33.33%.
      const submitted = await learner1(
        'post',
        `/quiz-attempts/${attemptId}/submit`,
      ).expect(200);
      expect(submitted.body).toMatchObject({
        status: 'COMPLETED',
        earnedPoints: 10,
        totalPoints: 30,
        percentage: 33.33,
        score: 33,
        isPassed: true,
      });
      const resultV1 = await learner1(
        'get',
        `/quiz-attempts/${attemptId}/result`,
      ).expect(200);
      // AFTER_SUBMIT: the key and explanations are disclosed.
      expect(resultV1.body).toMatchObject({
        reviewAllowed: true,
        score: {
          earnedPoints: 10,
          totalPoints: 30,
          percentage: 33.33,
          passed: true,
        },
      });
      expect(resultV1.body.questions[0]).toMatchObject({
        isCorrect: true,
        explanation: 'SECRET Superset của JavaScript',
      });

      // 3. Versioning: Instructor A edits and publishes v2.
      const opened = await author(
        'post',
        `/admin/quizzes/${quiz.id}/versions`,
      ).expect(201);
      expect(opened.body).toMatchObject({ version: 2, status: 'DRAFT' });
      await author('put', `/admin/quizzes/${quiz.id}/questions/${quiz.q1.id}`, {
        content: 'Q1 v2: TypeScript do ai phát triển?',
      }).expect(200);
      await author('put', `/admin/options/${quiz.q1.options[1]!.id}`, {
        content: 'Microsoft',
        isCorrect: true,
      }).expect(200);
      expect(await e.publish(instructorA, quiz.id)).toMatchObject({
        version: 2,
      });

      // Student 1's v1 attempt is immutable: same content, key and score.
      const resultAgain = await learner1(
        'get',
        `/quiz-attempts/${attemptId}/result`,
      ).expect(200);
      expect(resultAgain.body).toEqual(resultV1.body);
      expect(resultAgain.body.questions[0].content).toBe(
        'Q1 v1: TypeScript là gì?',
      );

      // Student 2 starts on v2.
      const v2 = await learner2('post', `/quizzes/${quiz.id}/attempts`).expect(
        201,
      );
      expect(v2.body.quiz.questions[0].content).toBe(
        'Q1 v2: TypeScript do ai phát triển?',
      );
      const [{ version2 }] = await e.db.query(
        'SELECT quiz_version AS version2 FROM quiz_attempts WHERE id = $1',
        [v2.body.id],
      );
      expect(version2).toBe(2);
      // The v1 answer is now wrong under the v2 key.
      await learner2('put', `/quiz-attempts/${v2.body.id}/answers`, {
        questionId: quiz.q1.id,
        selectedOptionId: quiz.q1.options[0]!.id,
      }).expect(200);
      const graded = await learner2(
        'post',
        `/quiz-attempts/${v2.body.id}/submit`,
      ).expect(200);
      expect(graded.body).toMatchObject({ earnedPoints: 0, isPassed: false });
    });
  });
});
