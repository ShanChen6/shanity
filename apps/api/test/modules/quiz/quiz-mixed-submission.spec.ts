import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type StartedQuestion = {
  id: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('Sprint 9 mixed Quiz submission engine', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  let origin: string;

  beforeAll(async () => {
    t = await learningApp('quiz-mixed-submission');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });

  afterAll(() => t?.app.close());

  async function createQuiz(mcqCount: number, essayCount: number) {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ($1, $2, $3, 'LESSON', $4, 'PUBLISHED', now(), 80, false,
         false, false)
       RETURNING id`,
      [
        'Mixed assessment',
        `mixed-${randomUUID()}`,
        owner.id,
        course.lessons[0]!.id,
      ],
    );

    for (let index = 0; index < mcqCount; index++) {
      const [question] = await t.db.query(
        `INSERT INTO quiz_questions(
           quiz_id, type, content, position, points
         ) VALUES ($1, 'MULTIPLE_CHOICE', $2, $3, 10)
         RETURNING id`,
        [quiz.id, `MCQ ${index + 1}`, index + 1],
      );
      await t.db.query(
        `INSERT INTO quiz_options(
           question_id, content, position, is_correct
         ) VALUES ($1, 'Correct', 1, true), ($1, 'Wrong', 2, false)`,
        [question.id],
      );
    }

    for (let index = 0; index < essayCount; index++)
      await t.db.query(
        `INSERT INTO quiz_questions(
           quiz_id, type, content, position, points, essay_config
         ) VALUES ($1, 'ESSAY', $2, $3, 10, $4::jsonb)`,
        [
          quiz.id,
          `Essay ${index + 1}`,
          mcqCount + index + 1,
          JSON.stringify({
            allowedSubmissionTypes: ['TEXT_WITH_KATEX', 'FILE_UPLOAD'],
            maxFileUploads: 3,
            maxWords: 500,
            rubric: [{ criterion: 'Reasoning', maxPoints: 10 }],
          }),
        ],
      );

    const started = await t
      .http()
      .post(`/quizzes/${quiz.id}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    return {
      quizId: quiz.id as string,
      attemptId: started.body.id as string,
      questions: started.body.quiz.questions as StartedQuestion[],
    };
  }

  const submit = (attemptId: string, answers: object[]) =>
    t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({ answers });

  it('completes and fully scores an objective-only Quiz', async () => {
    const attempt = await createQuiz(2, 0);
    const answers = attempt.questions.map((question) => ({
      questionId: question.id,
      selectedOptionIds: [question.options[0]!.id],
    }));

    const response = await submit(attempt.attemptId, answers).expect(200);
    expect(response.body).toMatchObject({
      status: 'COMPLETED',
      earnedPoints: 20,
      totalPoints: 20,
      score: 100,
      percentage: 100,
      isPassed: true,
    });
  });

  it('auto-grades 3 MCQs and leaves 2 Essay answers UNGRADED', async () => {
    const attempt = await createQuiz(3, 2);
    const attachments = [
      {
        url: 'https://cdn.example.test/work/diagram-1.png',
        filename: 'diagram-1.png',
        mimeType: 'image/png',
        size: 123_456,
      },
    ];
    const answers = attempt.questions.map((question, index) =>
      question.type === 'ESSAY'
        ? {
            questionId: question.id,
            essayAnswer: {
              text: `Derivation ${index}: $E = mc^2$`,
              attachments,
            },
          }
        : {
            questionId: question.id,
            selectedOptionIds: [question.options[0]!.id],
          },
    );

    const response = await submit(attempt.attemptId, answers).expect(200);
    expect(response.body).toMatchObject({
      status: 'NEEDS_GRADING',
      earnedPoints: 30,
      totalPoints: 50,
      score: 60,
      percentage: 60,
      isPassed: null,
    });

    const rows = (await t.db.query(
      `SELECT answer.question_id AS "questionId",
         question.type, answer.selected_option_ids AS "selectedOptionIds",
         answer.essay_answer AS "essayAnswer", answer.grading,
         answer.is_correct AS "isCorrect",
         answer.points_earned AS "pointsEarned"
       FROM attempt_answers answer
       JOIN quiz_questions question ON question.id = answer.question_id
       WHERE answer.attempt_id = $1
       ORDER BY question.position`,
      [attempt.attemptId],
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'MULTIPLE_CHOICE',
          isCorrect: true,
          pointsEarned: 10,
          grading: null,
        }),
      ]),
    );
    for (const row of rows.slice(3))
      expect(row).toMatchObject({
        type: 'ESSAY',
        selectedOptionIds: [],
        essayAnswer: expect.objectContaining({ attachments }),
        grading: { status: 'UNGRADED', awardedPoints: null },
        isCorrect: null,
        pointsEarned: 0,
      });
  });

  it('rejects an Essay answer without text or attachments', async () => {
    const attempt = await createQuiz(0, 1);
    const essay = attempt.questions[0]!;

    const response = await submit(attempt.attemptId, [
      { questionId: essay.id, essayAnswer: {} },
    ]).expect(400);
    expect(JSON.stringify(response.body)).toContain(
      'essayAnswer must contain non-empty text or at least one attachment',
    );
  });
});
