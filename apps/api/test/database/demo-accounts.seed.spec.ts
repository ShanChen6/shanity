import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { DatabaseService } from '../../src/database/database.module.js';
import {
  DEMO_ACCOUNTS,
  demoPassword,
  seedDemoAccounts,
} from '../../src/database/seeds/demo-accounts.seed.js';
import {
  DEMO_COURSE_SLUG,
  DEMO_DRAFT_COURSE_SLUG,
} from '../../src/database/seeds/demo-content.seed.js';
import { SAMPLE_COURSE_SLUG } from '../../src/database/seeds/sample-course.seed.js';
import { learningApp } from '../support/learning-fixture.js';

describe('demo accounts seed', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;

  beforeAll(async () => {
    t = await learningApp('seed-demo');
    origin = t.app.get(AuthConfig).origin;
    const dataSource = t.app.get(DatabaseService).dataSource;
    // The sample-course seed owns this course; a stand-in exercises the
    // enrollment step without writing lesson files to disk.
    await t.db.query(
      `INSERT INTO courses(slug, title) VALUES ($1, 'Seed stand-in')
       ON CONFLICT (slug) DO NOTHING`,
      [SAMPLE_COURSE_SLUG],
    );
    await seedDemoAccounts(dataSource);
    await seedDemoAccounts(dataSource); // idempotent
  });
  afterAll(() => t?.app.close());

  const login = async (email: string) => {
    const response = await t
      .http()
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email, password: demoPassword() })
      .expect(200);
    return ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((value) => value.split(';')[0])
      .join('; ');
  };

  it('creates each account once, with exactly its roles', async () => {
    for (const account of DEMO_ACCOUNTS) {
      const rows = await t.db.query(
        'SELECT count(*)::int AS n FROM users WHERE email = $1',
        [account.email],
      );
      expect(rows[0].n).toBe(1);
      const session = await login(account.email);
      const me = await t
        .http()
        .get('/api/v1/me')
        .set('Cookie', session)
        .expect(200);
      const byName = (a: string, b: string) => a.localeCompare(b);
      expect([...(me.body.data.roles as string[])].sort(byName)).toEqual(
        [...account.roles].sort(byName),
      );
    }
  });

  it('gives every role the access its domain implies', async () => {
    const [admin, instructor, student, finance] = await Promise.all(
      DEMO_ACCOUNTS.map((account) => login(account.email)),
    );
    const status = async (path: string, session: string) =>
      (await t.http().get(path).set('Cookie', session)).status;

    expect(await status('/api/v1/admin/users', admin!)).toBe(200);
    expect(await status('/api/v1/admin/users', instructor!)).toBe(403);
    expect(await status('/api/v1/admin/users', student!)).toBe(403);
    expect(await status('/api/v1/instructor/quizzes', instructor!)).toBe(200);
    expect(await status('/api/v1/instructor/quizzes', student!)).toBe(403);
    expect(await status('/api/v1/admin/orders', finance!)).toBe(200);
    expect(await status('/api/v1/student/quizzes/standalone', student!)).toBe(
      200,
    );
  });

  it('enrolls the demo student in the sample course, once', async () => {
    const rows = await t.db.query(
      `SELECT count(*)::int AS n
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN courses c ON c.id = e.course_id
        WHERE u.email = $1 AND c.slug = $2`,
      [DEMO_ACCOUNTS[2].email, SAMPLE_COURSE_SLUG],
    );
    expect(rows[0].n).toBe(1);
  });

  it('gives the instructor a published and a draft course of their own', async () => {
    const instructor = await login(DEMO_ACCOUNTS[1].email);
    const response = await t
      .http()
      .get('/api/v1/instructor/courses')
      .set('Cookie', instructor)
      .expect(200);
    const bySlug = new Map(
      (response.body.data as Array<{ slug: string; status: string }>).map(
        (course) => [course.slug, course.status],
      ),
    );
    expect(bySlug.get(DEMO_COURSE_SLUG)).toBe('published');
    expect(bySlug.get(DEMO_DRAFT_COURSE_SLUG)).toBe('draft');
  });

  it('shows the student real progress in the demo course', async () => {
    const student = await login(DEMO_ACCOUNTS[2].email);
    const response = await t
      .http()
      .get('/api/v1/student/enrolled-courses')
      .set('Cookie', student)
      .expect(200);
    const course = (
      response.body.data as Array<{
        title: string;
        progress: { percentage: number; isCompleted: boolean };
      }>
    ).find((item) => item.title === 'Thiết kế giao diện web cơ bản');
    expect(course?.progress.percentage).toBeGreaterThan(0);
    expect(course?.progress.percentage).toBeLessThan(100);
    expect(course?.progress.isCompleted).toBe(false);
  });

  it('puts one essay answer in the instructor grading queue', async () => {
    const instructor = await login(DEMO_ACCOUNTS[1].email);
    const response = await t
      .http()
      .get('/api/v1/instructor/grading-queue?status=NEEDS_GRADING')
      .set('Cookie', instructor)
      .expect(200);
    expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
    const attempt = (
      response.body.data as Array<{
        attemptId: string;
        student: { email: string };
        pendingEssaysCount: number;
      }>
    ).find((item) => item.student.email === DEMO_ACCOUNTS[2].email);
    expect(attempt?.pendingEssaysCount).toBe(1);
  });

  it('publishes a playable standalone quiz owned by the instructor', async () => {
    const student = await login(DEMO_ACCOUNTS[2].email);
    // By slug, not by scanning the list: other suites share this database and
    // can push the demo quiz off the first page.
    const detail = await t
      .http()
      .get('/api/v1/student/quizzes/standalone/demo-kiem-tra-javascript-co-ban')
      .set('Cookie', student)
      .expect(200);
    expect(detail.body).toMatchObject({
      success: true,
      data: { slug: 'demo-kiem-tra-javascript-co-ban' },
    });
  });

  it('never overwrites an existing password on re-seed', async () => {
    const email = DEMO_ACCOUNTS[2].email;
    const [{ password_hash: original }] = await t.db.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [email],
    );
    try {
      await t.db.query(
        `UPDATE users SET password_hash = 'x' WHERE email = $1`,
        [email],
      );
      await seedDemoAccounts(t.app.get(DatabaseService).dataSource);
      const [row] = await t.db.query(
        'SELECT password_hash FROM users WHERE email = $1',
        [email],
      );
      expect(row.password_hash).toBe('x');
    } finally {
      // Leave the shared test database exactly as found.
      await t.db.query('UPDATE users SET password_hash = $2 WHERE email = $1', [
        email,
        original,
      ]);
    }
  });
});
