import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { QuizQuestionAuthoringService } from '../../../src/modules/quiz/services/quiz-question-authoring.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Option = {
  id: string;
  content: string;
  position: number;
  isCorrect: boolean;
};
type Question = {
  id: string;
  quizId: string;
  type: string;
  content: string;
  position: number;
  points: number;
  explanation: string | null;
  options: Option[];
};

describe('Q7 question and option authoring', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let otherInstructor: Account;
  let student: Account;
  let admin: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q7');
    // Listen once: supertest re-listens an idle server per request, which
    // breaks requests built ahead of time (the lists of calls below).
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    otherInstructor = await t.account('instructor');
    student = await t.account();
    admin = await t.account();
    await t.db.query(
      `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'admin')`,
      [admin.id],
    );
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  const call = (
    method: 'post' | 'put' | 'patch' | 'delete',
    path: string,
    session: string,
    body?: object,
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session);
    return body ? pending.send(body) : pending;
  };

  async function draftQuiz() {
    const response = await call('post', '/admin/quizzes', owner.session, {
      title: `Q7 ${randomUUID().slice(0, 8)}`,
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
    }).expect(201);
    return response.body.id as string;
  }
  async function addQuestion(
    quizId: string,
    body: object = {},
    session = owner.session,
  ) {
    const response = await call(
      'post',
      `/admin/quizzes/${quizId}/questions`,
      session,
      {
        content: 'Question',
        options: [{ content: 'Right', isCorrect: true }, { content: 'Wrong' }],
        ...body,
      },
    ).expect(201);
    return response.body as Question;
  }
  const positions = async (quizId: string) =>
    (await t.db.query(
      `SELECT id, content, position FROM quiz_questions
       WHERE quiz_id = $1 ORDER BY position, id`,
      [quizId],
    )) as Array<{ id: string; content: string; position: number }>;
  const optionRows = async (questionId: string) =>
    (await t.db.query(
      `SELECT id, content, position, is_correct AS "isCorrect" FROM quiz_options
       WHERE question_id = $1 ORDER BY position, id`,
      [questionId],
    )) as Array<{
      id: string;
      content: string;
      position: number;
      isCorrect: boolean;
    }>;
  const setStatus = (quizId: string, status: string) =>
    t.db.query('UPDATE quizzes SET status = $2 WHERE id = $1', [
      quizId,
      status,
    ]);

  describe('state and ownership', () => {
    it('refuses every mutation unless the quiz is DRAFT', async () => {
      for (const status of ['PUBLISHED', 'ARCHIVED']) {
        const quizId = await draftQuiz();
        const question = await addQuestion(quizId);
        const option = question.options[0]!;
        await setStatus(quizId, status);

        const attempts = [
          call('post', `/admin/quizzes/${quizId}/questions`, owner.session, {
            content: 'Late',
          }),
          call(
            'put',
            `/admin/quizzes/${quizId}/questions/${question.id}`,
            owner.session,
            { content: 'Edited' },
          ),
          call(
            'delete',
            `/admin/quizzes/${quizId}/questions/${question.id}`,
            owner.session,
          ),
          call(
            'patch',
            `/admin/quizzes/${quizId}/questions/reorder`,
            owner.session,
            {
              items: [{ id: question.id, position: 1 }],
            },
          ),
          call(
            'post',
            `/admin/questions/${question.id}/options`,
            owner.session,
            {
              content: 'Late option',
            },
          ),
          call('put', `/admin/options/${option.id}`, owner.session, {
            isCorrect: false,
          }),
          call('delete', `/admin/options/${option.id}`, owner.session),
          call(
            'patch',
            `/admin/questions/${question.id}/options/reorder`,
            owner.session,
            {
              items: question.options.map(({ id }, index) => ({
                id,
                position: question.options.length - index,
              })),
            },
          ),
        ];
        for (const pending of attempts) {
          const response = await pending.expect(409);
          expect(response.body.code).toBe('QUIZ_NOT_EDITABLE');
        }
        expect(await positions(quizId)).toEqual([
          { id: question.id, content: 'Question', position: 1 },
        ]);
        expect(await optionRows(question.id)).toEqual([
          expect.objectContaining({
            id: option.id,
            isCorrect: true,
            position: 1,
          }),
          expect.objectContaining({ content: 'Wrong', position: 2 }),
        ]);
      }
    });

    it('treats a question of another quiz as not found', async () => {
      const quizA = await draftQuiz();
      const quizB = await draftQuiz();
      const questionA = await addQuestion(quizA);
      const questionB = await addQuestion(quizB, { content: 'B' });

      for (const pending of [
        call(
          'put',
          `/admin/quizzes/${quizA}/questions/${questionB.id}`,
          owner.session,
          { content: 'Hijacked' },
        ),
        call(
          'delete',
          `/admin/quizzes/${quizA}/questions/${questionB.id}`,
          owner.session,
        ),
      ])
        expect((await pending.expect(404)).body.code).toBe(
          'QUESTION_NOT_FOUND',
        );
      expect(
        (
          await call(
            'patch',
            `/admin/quizzes/${quizA}/questions/reorder`,
            owner.session,
            {
              items: [
                { id: questionA.id, position: 1 },
                { id: questionB.id, position: 2 },
              ],
            },
          ).expect(400)
        ).body.code,
      ).toBe('REORDER_ITEMS_MISMATCH');
      expect(
        (
          await call(
            'patch',
            `/admin/questions/${questionA.id}/options/reorder`,
            owner.session,
            {
              items: [
                { id: questionA.options[0]!.id, position: 1 },
                { id: questionB.options[0]!.id, position: 2 },
              ],
            },
          ).expect(400)
        ).body.code,
      ).toBe('REORDER_ITEMS_MISMATCH');
      expect((await positions(quizB))[0]).toMatchObject({ content: 'B' });
    });

    it('forbids instructors who do not manage the course', async () => {
      const quizId = await draftQuiz();
      const question = await addQuestion(quizId);
      const option = question.options[0]!;

      for (const pending of [
        call(
          'post',
          `/admin/quizzes/${quizId}/questions`,
          otherInstructor.session,
          {
            content: 'Intruder',
          },
        ),
        call(
          'put',
          `/admin/quizzes/${quizId}/questions/${question.id}`,
          otherInstructor.session,
          { points: 1 },
        ),
        call(
          'delete',
          `/admin/quizzes/${quizId}/questions/${question.id}`,
          otherInstructor.session,
        ),
        call(
          'post',
          `/admin/questions/${question.id}/options`,
          otherInstructor.session,
          {
            content: 'Intruder',
          },
        ),
        call('put', `/admin/options/${option.id}`, otherInstructor.session, {
          isCorrect: false,
        }),
        call('delete', `/admin/options/${option.id}`, otherInstructor.session),
      ])
        expect((await pending.expect(403)).body.code).toBe('QUIZ_FORBIDDEN');
      await call(
        'post',
        `/admin/quizzes/${quizId}/questions`,
        student.session,
        {
          content: 'Student',
        },
      ).expect(403);
      await addQuestion(quizId, { content: 'By admin' }, admin.session);
      expect((await positions(quizId)).map(({ content }) => content)).toEqual([
        'Question',
        'By admin',
      ]);
    });

    it('masks unknown ids as 403 QUIZ_FORBIDDEN, admins included', async () => {
      for (const session of [owner.session, admin.session])
        for (const pending of [
          call('post', `/admin/quizzes/${randomUUID()}/questions`, session, {
            content: 'Q',
          }),
          call('post', `/admin/questions/${randomUUID()}/options`, session, {
            content: 'O',
          }),
          call('put', `/admin/options/${randomUUID()}`, session, {
            content: 'O',
          }),
          call('put', '/admin/options/not-a-uuid', session, { content: 'O' }),
        ])
          expect((await pending.expect(403)).body.code).toBe('QUIZ_FORBIDDEN');
    });
  });

  describe('create and update', () => {
    it('creates a question with options, defaults and sanitized HTML', async () => {
      const quizId = await draftQuiz();
      await addQuestion(quizId, { content: 'First' });
      const question = await addQuestion(quizId, {
        content:
          '<p>What is <strong>2 + 2</strong>?</p><script>alert(1)</script>',
        explanation: '<em>Basic</em><img src="javascript:alert(1)">',
        options: [
          { content: '<b>4</b>', isCorrect: true },
          { content: '5' },
          { content: '6' },
        ],
      });
      expect(question).toMatchObject({
        quizId,
        type: 'SINGLE_CHOICE',
        content: '<p>What is <strong>2 + 2</strong>?</p>',
        position: 2,
        points: 10,
        explanation: '<em>Basic</em><img />',
      });
      expect(
        question.options.map(({ content, position, isCorrect }) => [
          content,
          position,
          isCorrect,
        ]),
      ).toEqual([
        ['4', 1, true],
        ['5', 2, false],
        ['6', 3, false],
      ]);
    });

    it('rejects invalid and system fields', async () => {
      const quizId = await draftQuiz();
      const path = `/admin/quizzes/${quizId}/questions`;
      for (const body of [
        {},
        { content: 'Q', points: 0 },
        { content: 'Q', type: 'ESSAY' },
        { content: 'Q', quizId: randomUUID() },
        { content: 'Q', position: 5 },
        { content: 'Q', id: randomUUID() },
        { content: 'Q', options: [{ content: 'A', position: 1 }] },
        { content: 'Q', options: [{ content: 'A', questionId: randomUUID() }] },
      ])
        await call('post', path, owner.session, body).expect(400);
      expect(
        (
          await call('post', path, owner.session, {
            content: '<script>x</script>',
          }).expect(400)
        ).body.code,
      ).toBe('QUESTION_CONTENT_REQUIRED');
      expect(
        (
          await call('post', path, owner.session, {
            content: 'Q',
            options: [
              { content: 'A', isCorrect: true },
              { content: 'B', isCorrect: true },
            ],
          }).expect(400)
        ).body.code,
      ).toBe('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');
      expect(await positions(quizId)).toEqual([]);
    });

    it('updates only the fields sent', async () => {
      const quizId = await draftQuiz();
      const question = await addQuestion(quizId, {
        points: 5,
        explanation: 'Why',
      });
      const path = `/admin/quizzes/${quizId}/questions/${question.id}`;

      const updated = await call('put', path, owner.session, {
        content: 'Reworded',
      }).expect(200);
      expect(updated.body).toMatchObject({
        content: 'Reworded',
        points: 5,
        explanation: 'Why',
      });
      const cleared = await call('put', path, owner.session, {
        explanation: null,
        points: 7,
      }).expect(200);
      expect(cleared.body).toMatchObject({
        content: 'Reworded',
        points: 7,
        explanation: null,
      });
      await call('put', path, owner.session, { content: null }).expect(400);
    });

    it('keeps exactly one key on single choice and many on multiple choice', async () => {
      const quizId = await draftQuiz();
      const question = await addQuestion(quizId, {
        type: 'MULTIPLE_CHOICE',
        options: [
          { content: 'A', isCorrect: true },
          { content: 'B', isCorrect: true },
          { content: 'C' },
        ],
      });
      const path = `/admin/quizzes/${quizId}/questions/${question.id}`;
      expect(
        (
          await call('put', path, owner.session, {
            type: 'SINGLE_CHOICE',
          }).expect(400)
        ).body.code,
      ).toBe('SINGLE_CHOICE_HAS_MULTIPLE_CORRECT');

      const [, b, c] = question.options;
      await call('put', `/admin/options/${b!.id}`, owner.session, {
        isCorrect: false,
      }).expect(200);
      await call('put', path, owner.session, { type: 'SINGLE_CHOICE' }).expect(
        200,
      );
      // Radio semantics: marking C correct clears A.
      const switched = await call(
        'put',
        `/admin/options/${c!.id}`,
        owner.session,
        {
          isCorrect: true,
          content: 'C!',
        },
      ).expect(200);
      expect(
        (switched.body as Question).options.map(({ content, isCorrect }) => [
          content,
          isCorrect,
        ]),
      ).toEqual([
        ['A', false],
        ['B', false],
        ['C!', true],
      ]);
      const appended = await call(
        'post',
        `/admin/questions/${question.id}/options`,
        owner.session,
        { content: 'D', isCorrect: true },
      ).expect(201);
      expect(
        (appended.body as Question).options.map(
          ({ content, position, isCorrect }) => [content, position, isCorrect],
        ),
      ).toEqual([
        ['A', 1, false],
        ['B', 2, false],
        ['C!', 3, false],
        ['D', 4, true],
      ]);
    });
  });

  describe('reorder and positioning', () => {
    it('swaps two questions and normalizes positions', async () => {
      const quizId = await draftQuiz();
      const first = await addQuestion(quizId, { content: 'First' });
      const second = await addQuestion(quizId, { content: 'Second' });

      const response = await call(
        'patch',
        `/admin/quizzes/${quizId}/questions/reorder`,
        owner.session,
        {
          items: [
            { id: first.id, position: 20 },
            { id: second.id, position: 10 },
          ],
        },
      ).expect(200);
      expect(
        (response.body as Question[]).map(({ content, position }) => [
          content,
          position,
        ]),
      ).toEqual([
        ['Second', 1],
        ['First', 2],
      ]);
      expect(await positions(quizId)).toEqual([
        { id: second.id, content: 'Second', position: 1 },
        { id: first.id, content: 'First', position: 2 },
      ]);

      for (const items of [
        [{ id: first.id, position: 1 }],
        [
          { id: first.id, position: 1 },
          { id: second.id, position: 1 },
        ],
        [
          { id: first.id, position: 1 },
          { id: first.id, position: 2 },
        ],
      ])
        await call(
          'patch',
          `/admin/quizzes/${quizId}/questions/reorder`,
          owner.session,
          { items },
        ).expect(400);
    });

    it('reorders options', async () => {
      const quizId = await draftQuiz();
      const question = await addQuestion(quizId);
      const [right, wrong] = question.options;
      await call(
        'patch',
        `/admin/questions/${question.id}/options/reorder`,
        owner.session,
        {
          items: [
            { id: right!.id, position: 2 },
            { id: wrong!.id, position: 1 },
          ],
        },
      ).expect(200);
      expect(
        (await optionRows(question.id)).map(({ content }) => content),
      ).toEqual(['Wrong', 'Right']);
    });

    it('deletes a middle question, cascades its options and re-indexes', async () => {
      const quizId = await draftQuiz();
      const first = await addQuestion(quizId, { content: 'First' });
      const middle = await addQuestion(quizId, { content: 'Middle' });
      const last = await addQuestion(quizId, { content: 'Last' });

      const response = await call(
        'delete',
        `/admin/quizzes/${quizId}/questions/${middle.id}`,
        owner.session,
      ).expect(200);
      expect(
        (response.body as Question[]).map(({ id, position }) => [id, position]),
      ).toEqual([
        [first.id, 1],
        [last.id, 2],
      ]);
      expect(await positions(quizId)).toEqual([
        { id: first.id, content: 'First', position: 1 },
        { id: last.id, content: 'Last', position: 2 },
      ]);
      expect(await optionRows(middle.id)).toEqual([]);
      const [{ count }] = await t.db.query(
        'SELECT count(*)::int AS count FROM quiz_options WHERE id = ANY($1)',
        [middle.options.map(({ id }) => id)],
      );
      expect(count).toBe(0);
    });

    it('deletes a middle option and re-indexes the rest', async () => {
      const quizId = await draftQuiz();
      const question = await addQuestion(quizId, {
        options: [
          { content: 'A', isCorrect: true },
          { content: 'B' },
          { content: 'C' },
        ],
      });
      const response = await call(
        'delete',
        `/admin/options/${question.options[1]!.id}`,
        owner.session,
      ).expect(200);
      expect(
        (response.body as Question).options.map(({ content, position }) => [
          content,
          position,
        ]),
      ).toEqual([
        ['A', 1],
        ['C', 2],
      ]);
    });
  });

  it('checks publish readiness of the current structure', async () => {
    const service = t.app.get(QuizQuestionAuthoringService);
    const quizId = await draftQuiz();
    expect(await service.validateQuizStructureForPublish(quizId)).toEqual({
      valid: false,
      issues: [{ code: 'QUIZ_HAS_NO_QUESTIONS' }],
    });

    const complete = await addQuestion(quizId);
    const lonely = await addQuestion(quizId, {
      options: [{ content: 'Only', isCorrect: false }],
    });
    expect(await service.validateQuizStructureForPublish(quizId)).toEqual({
      valid: false,
      issues: [
        { code: 'QUESTION_NEEDS_TWO_OPTIONS', questionId: lonely.id },
        { code: 'QUESTION_MISSING_CORRECT_OPTION', questionId: lonely.id },
      ],
    });

    await call(
      'delete',
      `/admin/quizzes/${quizId}/questions/${lonely.id}`,
      owner.session,
    ).expect(200);
    expect(await service.validateQuizStructureForPublish(quizId)).toEqual({
      valid: true,
      issues: [],
    });
    expect(complete.options).toHaveLength(2);
  });
});
