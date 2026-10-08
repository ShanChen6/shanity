import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { DatabaseService } from '../../src/database/database.module.js';
import {
  DEMO_ACCOUNTS,
  demoPassword,
  seedDemoAccounts,
} from '../../src/database/seeds/demo-accounts.seed.js';
import { learningApp } from '../support/learning-fixture.js';

describe('demo accounts seed', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;

  beforeAll(async () => {
    t = await learningApp('seed-demo');
    origin = t.app.get(AuthConfig).origin;
    const dataSource = t.app.get(DatabaseService).dataSource;
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
      expect([...me.body.data.roles].sort()).toEqual([...account.roles].sort());
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

  it('publishes a playable standalone quiz owned by the instructor', async () => {
    const student = await login(DEMO_ACCOUNTS[2].email);
    const list = await t
      .http()
      .get('/api/v1/student/quizzes/standalone')
      .set('Cookie', student)
      .expect(200);
    const titles = JSON.stringify(list.body.data);
    expect(titles).toContain('demo-kiem-tra-javascript-co-ban');
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
