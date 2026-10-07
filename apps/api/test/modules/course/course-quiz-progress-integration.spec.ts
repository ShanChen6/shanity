import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Quiz = { id: string; questionId: string; right: string; wrong: string };
type Progress = {
  percentage: number;
  isCompleted: boolean;
  totalQuizzes: number;
  passedQuizzes: number;
  completedQuizzes: number;
  completedRequiredLessons: number;
  totalRequiredLessons: number;
};
type CourseQuiz = {
  id: string;
  status: string;
  stepCompleted: boolean;
  isPassed: boolean;
  attemptsRemaining: number | null;
};

describe('Q20 course-bound quizzes and course progress', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;

  beforeAll(async () => {
    t = await learningApp('course-q20');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
  });
  afterAll(() => t?.app.close());

  /** A published one-question quiz (10 points, pass at 100%). */
  async function quiz(
    scope: 'LESSON' | 'CHAPTER' | 'COURSE',
    targetId: string,
    isRequired: boolean,
    maxAttempts: number | null = null,
  ): Promise<Quiz> {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: `${scope} ${isRequired ? 'required' : 'optional'}`,
      scope,
      targetId,
      isRequired,
      maxAttempts,
      passingScore: 100,
      shuffleOptions: false,
    }).expect(201);
    const question = await send(`/admin/quizzes/${created.body.id}/questions`, {
      content: 'Pick the right one',
      options: [{ content: 'Right', isCorrect: true }, { content: 'Wrong' }],
    }).expect(201);
    await send(`/admin/quizzes/${created.body.id}/publish`).expect(200);
    return {
      id: created.body.id,
      questionId: question.body.id,
      right: question.body.options[0].id,
      wrong: question.body.options[1].id,
    };
  }

  const call = (
    student: Account,
    method: 'post' | 'put' | 'get',
    path: string,
    body?: object,
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', student.session);
    return body ? pending.send(body) : pending;
  };

  /** Start, answer, submit: the full learner flow over HTTP. */
  async function take(student: Account, q: Quiz, pass: boolean) {
    const attemptId = (
      await call(student, 'post', `/quizzes/${q.id}/attempts`).expect(201)
    ).body.id as string;
    await call(student, 'put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: q.questionId,
      selectedOptionId: pass ? q.right : q.wrong,
    }).expect(200);
    const submitted = await call(
      student,
      'post',
      `/quiz-attempts/${attemptId}/submit`,
    ).expect(200);
    expect(submitted.body).toMatchObject({
      status: 'SUBMITTED',
      isPassed: pass,
    });
    return attemptId;
  }

  const progress = async (student: Account, courseId: string) =>
    (await t.progress(student.session, courseId).expect(200)).body as Progress;
  const courseQuiz = async (
    student: Account,
    courseId: string,
    quizId: string,
  ) =>
    (
      (await call(student, 'get', `/courses/${courseId}/quizzes`).expect(200))
        .body.quizzes as CourseQuiz[]
    ).find(({ id }) => id === quizId)!;
  const lesson = (student: Account, lessonId: string) =>
    t.http().get(`/lessons/${lessonId}`).set('Cookie', student.session);

  describe('progress and gate enforcement', () => {
    it('blocks progress and the next lesson while a required quiz is failed, then unblocks on a pass', async () => {
      const student = await t.account();
      const course = await t.course(owner, 2, [student]);
      await t.db.query(
        'UPDATE courses SET is_sequential = true WHERE id = $1',
        [course.id],
      );
      const [first, second] = course.lessons;
      const required = await quiz('LESSON', first!.id, true, 3);

      // Learn lesson 1, then fail its required quiz.
      await t.complete(student.session, first!.id).expect(200);
      await take(student, required, false);

      expect(await progress(student, course.id)).toMatchObject({
        completedRequiredLessons: 1,
        totalQuizzes: 1,
        completedQuizzes: 0,
        // 1 of 3 steps (2 lessons + 1 quiz): the failed quiz adds nothing.
        percentage: 33,
        isCompleted: false,
      });
      expect(await courseQuiz(student, course.id, required.id)).toMatchObject({
        status: 'FAILED',
        stepCompleted: false,
        attemptsRemaining: 2,
      });
      // Not marked done: lesson 2 stays locked behind the quiz.
      const locked = await lesson(student, second!.id).expect(403);
      expect(locked.body).toMatchObject({
        code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
        requiredLesson: { id: first!.id, quizId: required.id },
      });

      // Retake and pass.
      await take(student, required, true);
      expect(await progress(student, course.id)).toMatchObject({
        completedQuizzes: 1,
        passedQuizzes: 1,
        percentage: 66,
        isCompleted: false,
      });
      expect(await courseQuiz(student, course.id, required.id)).toMatchObject({
        status: 'PASSED',
        stepCompleted: true,
        isPassed: true,
      });
      await lesson(student, second!.id).expect(200);

      await t.complete(student.session, second!.id).expect(200);
      expect(await progress(student, course.id)).toMatchObject({
        percentage: 100,
        isCompleted: true,
      });
    });

    it('counts a failed optional quiz as a completed step', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      const optional = await quiz('CHAPTER', course.chapterId, false);

      await t.complete(student.session, course.lessons[0]!.id).expect(200);
      expect(await progress(student, course.id)).toMatchObject({
        completedQuizzes: 0,
        percentage: 50,
        // Optional quizzes never gate completion.
        isCompleted: true,
      });

      await take(student, optional, false);
      expect(await progress(student, course.id)).toMatchObject({
        passedQuizzes: 0,
        completedQuizzes: 1,
        percentage: 100,
        isCompleted: true,
      });
      expect(await courseQuiz(student, course.id, optional.id)).toMatchObject({
        status: 'FAILED',
        stepCompleted: true,
      });
    });

    it('keeps a passed required quiz done after a later failing attempt', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      const required = await quiz('COURSE', course.id, true);
      await t.complete(student.session, course.lessons[0]!.id).expect(200);

      await take(student, required, true);
      const latest = await take(student, required, false);
      expect(await progress(student, course.id)).toMatchObject({
        completedQuizzes: 1,
        percentage: 100,
        isCompleted: true,
      });
      expect(await courseQuiz(student, course.id, required.id)).toMatchObject({
        status: 'PASSED',
        stepCompleted: true,
        // The newest closed attempt, for "see latest result".
        latestAttemptId: latest,
      });
    });

    it('shows IN_PROGRESS and NOT_STARTED badges', async () => {
      const student = await t.account();
      const course = await t.course(owner, 1, [student]);
      const running = await quiz('COURSE', course.id, false);
      const untouched = await quiz('CHAPTER', course.chapterId, true);
      await call(student, 'post', `/quizzes/${running.id}/attempts`).expect(
        201,
      );
      expect(await courseQuiz(student, course.id, running.id)).toMatchObject({
        status: 'IN_PROGRESS',
        stepCompleted: false,
      });
      expect(await courseQuiz(student, course.id, untouched.id)).toMatchObject({
        status: 'NOT_STARTED',
        stepCompleted: false,
      });
    });
  });
});
