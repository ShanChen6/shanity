import type { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from '../../auth/password.js';
import { SAMPLE_COURSE_SLUG } from './sample-course.seed.js';

/**
 * Demo accounts for all four roles, so every UI (student, instructor, admin,
 * finance) can be exercised right after `pnpm db:seed`. Idempotent: existing
 * accounts keep their password, roles are only ever added.
 */
export const DEMO_PASSWORD_ENV = 'SEED_DEMO_PASSWORD';
const DEFAULT_DEMO_PASSWORD = 'Shanity-Demo-2026!';

export const DEMO_ACCOUNTS = [
  {
    id: '18000000-0000-4000-8000-000000000001',
    email: 'admin@shanity.local',
    displayName: 'Demo Admin',
    roles: ['student', 'admin'],
  },
  {
    id: '18000000-0000-4000-8000-000000000002',
    email: 'instructor@shanity.local',
    displayName: 'Demo Instructor',
    roles: ['student', 'instructor'],
  },
  {
    id: '18000000-0000-4000-8000-000000000003',
    email: 'student@shanity.local',
    displayName: 'Demo Student',
    roles: ['student'],
  },
  {
    id: '18000000-0000-4000-8000-000000000004',
    email: 'finance@shanity.local',
    displayName: 'Demo Finance Officer',
    roles: ['student', 'finance_officer'],
  },
] as const;

const QUIZ = {
  id: '18000000-0000-4000-8000-000000000101',
  slug: 'demo-kiem-tra-javascript-co-ban',
  questions: [
    {
      id: '18000000-0000-4000-8000-000000000111',
      content: 'Từ khóa nào khai báo một biến có thể gán lại giá trị?',
      options: [
        ['18000000-0000-4000-8000-000000000121', 'let', true],
        ['18000000-0000-4000-8000-000000000122', 'const', false],
        ['18000000-0000-4000-8000-000000000123', 'static', false],
      ],
    },
    {
      id: '18000000-0000-4000-8000-000000000112',
      content: 'typeof "shanity" trả về kết quả nào?',
      options: [
        ['18000000-0000-4000-8000-000000000124', 'string', true],
        ['18000000-0000-4000-8000-000000000125', 'text', false],
        ['18000000-0000-4000-8000-000000000126', 'object', false],
      ],
    },
  ],
} as const;

export function demoPassword(): string {
  const configured = process.env[DEMO_PASSWORD_ENV];
  if (configured === undefined) return DEFAULT_DEMO_PASSWORD;
  if (configured.length < 12 || configured.length > 128)
    throw new Error(`${DEMO_PASSWORD_ENV} must be 12-128 characters`);
  return configured;
}

async function ensureAccounts(manager: EntityManager) {
  // Hash once: scrypt is deliberately slow and every account shares the password.
  const passwordHash = await hashPassword(demoPassword());
  for (const account of DEMO_ACCOUNTS) {
    await manager.query(
      `INSERT INTO users(id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [account.id, account.email, account.displayName, passwordHash],
    );
    const [user] = await manager.query<Array<{ id: string }>>(
      'SELECT id FROM users WHERE email = $1',
      [account.email],
    );
    for (const role of account.roles)
      await manager.query(
        `INSERT INTO user_roles(user_id, role_code) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user!.id, role],
      );
  }
}

async function ensureEnrollment(manager: EntityManager) {
  // The course comes from the sample-course seed; skip quietly if it is absent.
  const [course] = await manager.query<Array<{ id: string }>>(
    'SELECT id FROM courses WHERE slug = $1',
    [SAMPLE_COURSE_SLUG],
  );
  if (!course) return;
  await manager.query(
    `INSERT INTO enrollments(user_id, course_id)
     SELECT id, $2 FROM users WHERE email = 'student@shanity.local'
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [DEMO_ACCOUNTS[2].id, course.id],
  );
}

async function ensureQuiz(manager: EntityManager) {
  const [owner] = await manager.query<Array<{ id: string }>>(
    'SELECT id FROM users WHERE email = $1',
    [DEMO_ACCOUNTS[1].email],
  );
  await manager.query(
    `INSERT INTO quizzes(id, title, slug, description, scope, status,
       passing_score, created_by, published_at, shuffle_questions, shuffle_options)
     VALUES ($1, 'Kiểm tra JavaScript cơ bản', $2,
       'Bài kiểm tra mẫu để thử luồng làm bài và chấm điểm.',
       'STANDALONE', 'PUBLISHED', 50, $3, now(), false, false)
     ON CONFLICT (id) DO NOTHING`,
    [QUIZ.id, QUIZ.slug, owner!.id],
  );
  for (const [index, question] of QUIZ.questions.entries()) {
    await manager.query(
      `INSERT INTO quiz_questions(id, quiz_id, content, position)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [question.id, QUIZ.id, question.content, index + 1],
    );
    for (const [
      position,
      [id, content, isCorrect],
    ] of question.options.entries())
      await manager.query(
        `INSERT INTO quiz_options(id, question_id, content, position, is_correct)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, question.id, content, position + 1, isCorrect],
      );
  }
}

export async function seedDemoAccounts(db: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('The demo accounts seed is disabled in production');
  await db.transaction(async (manager) => {
    await ensureAccounts(manager);
    await ensureEnrollment(manager);
    await ensureQuiz(manager);
  });
}
