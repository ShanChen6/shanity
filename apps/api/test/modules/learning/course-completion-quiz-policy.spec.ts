import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { CourseProgressCalculatorService } from '../../../src/modules/progress/services/course-progress-calculator.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Scope = 'LESSON' | 'CHAPTER' | 'COURSE' | 'STANDALONE';
type Quiz = { id: string; correct: string; wrong: string };

describe('Q9 required quiz and course completion policy', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;

  beforeAll(async () => {
    t = await learningApp('quiz-q9');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
  });
  afterAll(() => t?.app.close());

  /** A published one-question quiz; returns its right and wrong option ids. */
  async function quiz(
    scope: Scope,
    targetId: string | null,
    { isRequired = true, status = 'PUBLISHED' } = {},
  ): Promise<Quiz> {
    const [row] = await t.db.query(
      `INSERT INTO quizzes(title, created_by, scope, target_id, status,
         is_required, shuffle_questions, shuffle_options)
       VALUES ($1, $2, $3, $4, $5, $6, false, false) RETURNING id`,
      [`Q9 ${scope}`, owner.id, scope, targetId, status, isRequired],
    );
    const [question] = await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, content) VALUES ($1, '2 + 2 = ?')
       RETURNING id`,
      [row.id],
    );
    const options = (await t.db.query(
      `INSERT INTO quiz_options(question_id, content, position, is_correct)
       VALUES ($1, '4', 1, true), ($1, '5', 2, false) RETURNING id, is_correct`,
      [question.id],
    )) as Array<{ id: string; is_correct: boolean }>;
    return {
      id: row.id,
      correct: options.find((option) => option.is_correct)!.id,
      wrong: options.find((option) => !option.is_correct)!.id,
    };
  }

  /** Takes the quiz through the learner API and submits it. */
  async function take(student: Account, target: Quiz, pass: boolean) {
    const started = await t
      .http()
      .post(`/quizzes/${target.id}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const questionId = started.body.quiz.questions[0].id as string;
    await t
      .http()
      .put(`/quiz-attempts/${started.body.id}/answers`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({
        questionId,
        selectedOptionIds: [pass ? target.correct : target.wrong],
      })
      .expect(200);
    const submitted = await t
      .http()
      .post(`/quiz-attempts/${started.body.id}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(200);
    expect(submitted.body.isPassed).toBe(pass);
  }

  async function completeAll(
    student: Account,
    course: Awaited<ReturnType<typeof t.course>>,
  ) {
    for (const lesson of course.lessons)
      await t.complete(student.session, lesson.id).expect(200);
  }

  const progress = async (student: Account, courseId: string) =>
    (await t.progress(student.session, courseId).expect(200)).body as {
      percentage: number;
      isCompleted: boolean;
      totalQuizzes: number;
      totalRequiredQuizzes: number;
      passedQuizzes: number;
      passedRequiredQuizzes: number;
      completedRequiredLessons: number;
      totalRequiredLessons: number;
    };

  describe('progress vs completion', () => {
    it('keeps a course incomplete while a required quiz is failed', async () => {
      const student = await t.account();
      const course = await t.course(owner, 9, [student]);
      const required = await quiz('LESSON', course.lessons[0]!.id);

      await completeAll(student, course);
      await take(student, required, false);
      expect(await progress(student, course.id)).toMatchObject({
        completedRequiredLessons: 9,
        totalRequiredLessons: 9,
        totalQuizzes: 1,
        totalRequiredQuizzes: 1,
        passedRequiredQuizzes: 0,
        percentage: 90,
        isCompleted: false,
      });

      await take(student, required, true);
      expect(await progress(student, course.id)).toMatchObject({
        passedRequiredQuizzes: 1,
        percentage: 100,
        isCompleted: true,
      });
    });

    it('completes a course with an optional quiz skipped', async () => {
      const student = await t.account();
      const course = await t.course(owner, 2, [student]);
      const required = await quiz('COURSE', course.id);
      await quiz('CHAPTER', course.chapterId, { isRequired: false });

      await completeAll(student, course);
      await take(student, required, true);
      expect(await progress(student, course.id)).toMatchObject({
        totalQuizzes: 2,
        totalRequiredQuizzes: 1,
        passedQuizzes: 1,
        // The optional quiz still counts towards the bar...
        percentage: 75,
        // ...but never blocks completion.
        isCompleted: true,
      });
    });

    it('requires the required lessons too, whatever the quizzes', async () => {
      const student = await t.account();
      const course = await t.course(owner, 2, [student]);
      const required = await quiz('CHAPTER', course.chapterId);

      await t.complete(student.session, course.lessons[0]!.id).expect(200);
      await take(student, required, true);
      expect(await progress(student, course.id)).toMatchObject({
        percentage: 66,
        isCompleted: false,
      });
    });

    it('keeps completion once achieved, even after a later failed attempt', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      const required = await quiz('COURSE', course.id);

      await completeAll(student, course);
      await take(student, required, true);
      await take(student, required, false);
      expect(await progress(student, course.id)).toMatchObject({
        passedRequiredQuizzes: 1,
        percentage: 100,
        isCompleted: true,
      });
    });

    it('ignores draft and archived quizzes and quizzes on unpublished lessons', async () => {
      const student = await t.account();
      const course = await t.course(owner, 2, [student]);
      await quiz('COURSE', course.id, { status: 'DRAFT' });
      await quiz('COURSE', course.id, { status: 'ARCHIVED' });
      const hidden = await t.addLesson(owner, course.chapterId, 'Hidden');
      await t.db.query(
        'UPDATE lessons SET is_published = false WHERE id = $1',
        [hidden.id],
      );
      await quiz('LESSON', hidden.id);

      await completeAll(student, course);
      expect(await progress(student, course.id)).toMatchObject({
        totalQuizzes: 0,
        percentage: 100,
        isCompleted: true,
      });
    });

    it('stops gating once a required quiz is archived', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      const required = await quiz('COURSE', course.id);
      await completeAll(student, course);
      expect((await progress(student, course.id)).isCompleted).toBe(false);

      await t
        .http()
        .delete(`/admin/quizzes/${required.id}`)
        .set('Origin', origin)
        .set('Cookie', owner.session)
        .expect(200);
      expect(await progress(student, course.id)).toMatchObject({
        totalQuizzes: 0,
        isCompleted: true,
      });
    });

    it('exposes the same figures on the enrolled courses list and the service', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      await quiz('CHAPTER', course.chapterId, { isRequired: false });
      await completeAll(student, course);

      const list = await t
        .http()
        .get('/student/enrolled-courses')
        .set('Cookie', student.session)
        .expect(200);
      expect(
        (list.body as Array<{ courseId: string; progress: object }>).find(
          (entry) => entry.courseId === course.id,
        )?.progress,
      ).toMatchObject({ percentage: 50, isCompleted: true });

      const service = t.app.get(CourseProgressCalculatorService);
      await expect(
        service.calculateLearningProgressPercentage(student.id, course.id),
      ).resolves.toBe(50);
      await expect(
        service.evaluateCourseCompletion(student.id, course.id),
      ).resolves.toBe(true);
    });
  });

  describe('standalone isolation', () => {
    it('never touches any course progress or completion', async () => {
      const student = await t.account();
      const course = await t.course(owner, 2, [student]);
      await completeAll(student, course);
      const before = await progress(student, course.id);

      const standalone = await quiz('STANDALONE', null, { isRequired: false });
      // Failed and passed standalone attempts alike.
      for (const [number, passed] of [
        [1, false],
        [2, true],
      ] as const)
        await t.db.query(
          `INSERT INTO quiz_attempts(user_id, quiz_id, quiz_version, attempt_number,
             quiz_snapshot, status, submitted_at, score, is_passed,
             earned_points, total_points, percentage)
           VALUES ($1, $2, 1, $3, '{"questions": []}', 'SUBMITTED', now(),
             $4::int, $5, $4::int, 100, $4::int)`,
          [student.id, standalone.id, number, passed ? 100 : 0, passed],
        );

      expect(await progress(student, course.id)).toEqual(before);
      expect(before).toMatchObject({
        totalQuizzes: 0,
        percentage: 100,
        isCompleted: true,
      });
    });

    it('cannot make a standalone quiz required, at any layer', async () => {
      const send = (method: 'post' | 'put', path: string, body: object) =>
        t
          .http()
          [method](path)
          .set('Origin', origin)
          .set('Cookie', owner.session)
          .send(body);
      expect(
        (
          await send('post', '/admin/quizzes', {
            title: 'Q9 standalone',
            scope: 'STANDALONE',
            isRequired: true,
          }).expect(400)
        ).body.code,
      ).toBe('STANDALONE_QUIZ_CANNOT_BE_REQUIRED');

      const created = await send('post', '/admin/quizzes', {
        title: 'Q9 standalone',
        scope: 'STANDALONE',
      }).expect(201);
      expect(
        (
          await send('put', `/admin/quizzes/${created.body.id}`, {
            isRequired: true,
          }).expect(400)
        ).body.code,
      ).toBe('STANDALONE_QUIZ_CANNOT_BE_REQUIRED');

      await expect(
        t.db.query(`UPDATE quizzes SET is_required = true WHERE id = $1`, [
          created.body.id,
        ]),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'CHK_quizzes_standalone_not_required',
      });
    });
  });
});
