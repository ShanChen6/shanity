import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../auth/auth.config.js';
import {
  learningApp,
  type Account,
} from '../../../../test/support/learning-fixture.js';

type Question = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('E11 instructor grading queue and course authorization', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let instructorA: Account;
  let instructorB: Account;
  let studentA: Account;
  let studentB: Account;
  let courseA: Awaited<ReturnType<typeof t.course>>;
  let courseB: Awaited<ReturnType<typeof t.course>>;
  let pendingAttempt: string;
  let gradedAttempt: string;
  let quizPending: string;
  let quizGraded: string;
  let foreignAttempt: string;
  const saved: Record<string, string | undefined> = {};
  const cloudinary = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  async function quizWithEssays(
    owner: Account,
    course: typeof courseA,
    essays: number,
  ) {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ($1, $2, $3, 'LESSON', $4, 'PUBLISHED', now(), 50, false,
         false, false) RETURNING id`,
      [
        `Grading ${essays} essays`,
        `grading-${randomUUID()}`,
        owner.id,
        course.lessons[0]!.id,
      ],
    );
    const [mcq] = await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points)
       VALUES ($1, 'MULTIPLE_CHOICE', 'MCQ', 1, 10) RETURNING id`,
      [quiz.id],
    );
    await t.db.query(
      `INSERT INTO quiz_options(question_id, content, position, is_correct)
       VALUES ($1, 'Right', 1, true), ($1, 'Wrong', 2, false)`,
      [mcq.id],
    );
    for (let index = 0; index < essays; index++)
      await t.db.query(
        `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
           essay_config)
         VALUES ($1, 'ESSAY', 'Essay', $2, 10, $3::jsonb)`,
        [
          quiz.id,
          2 + index,
          JSON.stringify({
            allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
            maxFileUploads: 1,
          }),
        ],
      );
    return quiz.id as string;
  }

  /** Starts and submits an attempt; the quiz has essays, so it needs grading. */
  async function submitAttempt(student: Account, quizId: string) {
    const started = await t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const answers = (started.body.quiz.questions as Question[]).map(
      (question) =>
        question.type === 'ESSAY'
          ? { questionId: question.id, essayAnswer: { text: 'My essay' } }
          : {
              questionId: question.id,
              selectedOptionIds: [question.options[0]!.id],
            },
    );
    await t
      .http()
      .post(`/quiz-attempts/${started.body.id}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({ answers })
      .expect(200);
    return started.body.id as string;
  }

  const queue = (session: string, query = '') =>
    t.http().get(`/instructor/grading-queue${query}`).set('Cookie', session);

  beforeAll(async () => {
    for (const name of cloudinary) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    t = await learningApp('instructor-grading');
    origin = t.app.get(AuthConfig).origin;
    instructorA = await t.account('instructor');
    instructorB = await t.account('instructor');
    studentA = await t.account();
    studentB = await t.account();
    courseA = await t.course(instructorA, 1, [studentA]);
    courseB = await t.course(instructorB, 1, [studentB]);

    quizPending = await quizWithEssays(instructorA, courseA, 2);
    quizGraded = await quizWithEssays(instructorA, courseA, 1);
    pendingAttempt = await submitAttempt(studentA, quizPending);
    gradedAttempt = await submitAttempt(studentA, quizGraded);
    // The final grading step belongs to E12; simulate its outcome.
    await t.db.query(
      `UPDATE attempt_answers SET grading = jsonb_build_object(
         'status', 'GRADED', 'awardedPoints', 8)
       WHERE attempt_id = $1 AND grading IS NOT NULL`,
      [gradedAttempt],
    );
    await t.db.query(
      `UPDATE quiz_attempts SET status = 'GRADED', is_passed = true WHERE id = $1`,
      [gradedAttempt],
    );
    foreignAttempt = await submitAttempt(
      studentB,
      await quizWithEssays(instructorB, courseB, 1),
    );
  });
  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
    await t?.app.close();
  });

  it('lists the attempts of the instructor own course with pending counts', async () => {
    const response = await queue(
      instructorA.session,
      `?courseId=${courseA.id}`,
    ).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const byAttempt = new Map(
      (response.body.items as Array<{ attemptId: string }>).map((item) => [
        item.attemptId,
        item,
      ]),
    );
    expect([...byAttempt.keys()].sort()).toEqual(
      [pendingAttempt, gradedAttempt].sort(),
    );
    expect(byAttempt.get(pendingAttempt)).toMatchObject({
      student: { id: studentA.id, email: studentA.email },
      course: { id: courseA.id },
      quiz: { id: quizPending },
      status: 'NEEDS_GRADING',
      totalEssays: 2,
      pendingEssaysCount: 2,
    });
    expect(byAttempt.get(gradedAttempt)).toMatchObject({
      status: 'GRADED',
      totalEssays: 1,
      pendingEssaysCount: 0,
    });
    // Pending work first.
    expect(response.body.items[0].attemptId).toBe(pendingAttempt);
    expect(JSON.stringify(response.body)).not.toContain(foreignAttempt);
  });

  it('never leaks another instructor course, with or without a filter', async () => {
    const own = await queue(instructorB.session).expect(200);
    expect(own.body.items.map((i: { attemptId: string }) => i.attemptId)).toEqual(
      [foreignAttempt],
    );
    // Without any filter, A still only sees A.
    const unfiltered = await queue(instructorA.session).expect(200);
    expect(JSON.stringify(unfiltered.body)).not.toContain(foreignAttempt);
  });

  it('answers 403 when an instructor names a course or quiz they do not teach', async () => {
    const byCourse = await queue(
      instructorB.session,
      `?courseId=${courseA.id}`,
    ).expect(403);
    expect(byCourse.body.message).toBe(
      'You do not have permission to access grading queue for this course',
    );
    await queue(instructorB.session, `?quizId=${quizPending}`).expect(403);
    // An unknown course is indistinguishable from a foreign one.
    await queue(instructorB.session, `?courseId=${randomUUID()}`).expect(403);
    // Students never reach it.
    await queue(studentA.session).expect(403);
    await t.http().get('/instructor/grading-queue').expect(401);
  });

  it('offers only the courses the instructor teaches as filter options', async () => {
    const response = await t
      .http()
      .get('/instructor/grading-queue/courses')
      .set('Cookie', instructorA.session)
      .expect(200);
    expect(response.body.map((course: { id: string }) => course.id)).toEqual([
      courseA.id,
    ]);
    await t
      .http()
      .get('/instructor/grading-queue/courses')
      .set('Cookie', studentA.session)
      .expect(403);
  });

  it('filters by status, quiz and student search accurately', async () => {
    const needs = await queue(
      instructorA.session,
      '?status=NEEDS_GRADING',
    ).expect(200);
    expect(needs.body.items.length).toBeGreaterThan(0);
    for (const item of needs.body.items)
      expect(item).toMatchObject({ status: 'NEEDS_GRADING' });
    expect(
      needs.body.items.every(
        (item: { pendingEssaysCount: number }) => item.pendingEssaysCount > 0,
      ),
    ).toBe(true);

    const graded = await queue(instructorA.session, '?status=GRADED').expect(
      200,
    );
    expect(graded.body.items.map((i: { attemptId: string }) => i.attemptId)).toEqual(
      [gradedAttempt],
    );

    const byQuiz = await queue(
      instructorA.session,
      `?quizId=${quizGraded}`,
    ).expect(200);
    expect(byQuiz.body.items).toHaveLength(1);

    const search = await queue(
      instructorA.session,
      `?search=${encodeURIComponent(studentA.email.toUpperCase())}`,
    ).expect(200);
    expect(search.body.items).toHaveLength(2);
    const none = await queue(
      instructorA.session,
      `?search=${encodeURIComponent('no-such-student-%')}`,
    ).expect(200);
    expect(none.body.items).toEqual([]);

    const paged = await queue(instructorA.session, '?limit=1&page=2').expect(
      200,
    );
    expect(paged.body.pagination).toMatchObject({
      page: 2,
      limit: 1,
      totalItems: 2,
      totalPages: 2,
    });
    await queue(instructorA.session, '?status=bogus').expect(400);
  });
});
