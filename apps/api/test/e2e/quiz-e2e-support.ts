import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { learningApp, type Account } from '../support/learning-fixture.js';

export type Scope = 'LESSON' | 'CHAPTER' | 'COURSE' | 'STANDALONE';
export const SCOPES: Scope[] = ['LESSON', 'CHAPTER', 'COURSE', 'STANDALONE'];
export type Question = {
  id: string;
  options: Array<{ id: string; content: string; isCorrect: boolean }>;
};
export type Course = Awaited<
  ReturnType<Awaited<ReturnType<typeof learningApp>>['course']>
>;

/** Every object key anywhere in a JSON payload. */
export function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, nested]) => [
      key,
      ...allKeys(nested),
    ]);
  return [];
}
export const ANSWER_KEYS = ['isCorrect', 'correctOptionId', 'explanation'];

/** The real app over HTTP, with helpers for each actor of the quiz engine. */
export async function quizEngine(label: string) {
  const t = await learningApp(label);
  // Listen once so parallel requests share one port.
  await t.app.listen(0);
  const origin = t.app.get(AuthConfig).origin;

  const as =
    (account: Account) =>
    (
      method: 'get' | 'post' | 'put' | 'patch' | 'delete',
      path: string,
      body?: object,
    ) => {
      const pending = t
        .http()
        [method](path)
        .set('Origin', origin)
        .set('Cookie', account.session);
      return body ? pending.send(body) : pending;
    };

  const targetOf = (scope: Scope, course: Course) =>
    ({
      LESSON: course.lessons[0]!.id,
      CHAPTER: course.chapterId,
      COURSE: course.id,
      STANDALONE: null,
    })[scope];

  /** Draft with Q1 (single, 10 pts) and Q2 (multiple, 20 pts). */
  async function draftQuiz(
    author: Account,
    scope: Scope,
    course: Course,
    settings: Record<string, unknown> = {},
  ) {
    const call = as(author);
    const slug = `e2e-${scope.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const created = await call('post', '/admin/quizzes', {
      title: `E2E ${scope}`,
      scope,
      targetId: targetOf(scope, course),
      ...(scope === 'STANDALONE' && { slug }),
      passingScore: 30,
      reviewPolicy: 'AFTER_SUBMIT',
      shuffleQuestions: false,
      shuffleOptions: false,
      ...settings,
    }).expect(201);
    const id = created.body.id as string;
    const q1 = (
      await call('post', `/admin/quizzes/${id}/questions`, {
        content: 'Q1 v1: TypeScript là gì?',
        points: 10,
        explanation: 'SECRET Superset của JavaScript',
        options: [
          { content: 'Superset của JS', isCorrect: true },
          { content: 'Framework CSS' },
        ],
      }).expect(201)
    ).body as Question;
    const q2 = (
      await call('post', `/admin/quizzes/${id}/questions`, {
        content: 'Q2 v1: Kiểu nguyên thủy?',
        type: 'MULTIPLE_CHOICE',
        points: 20,
        explanation: 'SECRET string và number',
        options: [
          { content: 'string', isCorrect: true },
          { content: 'number', isCorrect: true },
          { content: 'Date' },
        ],
      }).expect(201)
    ).body as Question;
    return { id, slug: scope === 'STANDALONE' ? slug : null, q1, q2 };
  }

  async function publish(author: Account, quizId: string) {
    const response = await as(author)(
      'post',
      `/admin/quizzes/${quizId}/publish`,
    ).expect(200);
    expect(response.body.status).toBe('PUBLISHED');
    return response.body as { version: number };
  }

  /** A published quiz, ready for learners. */
  async function publishedQuiz(
    author: Account,
    scope: Scope,
    course: Course,
    settings: Record<string, unknown> = {},
  ) {
    const quiz = await draftQuiz(author, scope, course, settings);
    await publish(author, quiz.id);
    return quiz;
  }

  return { ...t, origin, as, draftQuiz, publish, publishedQuiz };
}
