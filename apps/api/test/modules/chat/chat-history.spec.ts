import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

type View = {
  id: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  content: string;
  status: string;
  createdAt: string;
  cursor: string;
};
type Page = { messages: View[]; hasMore: boolean };

/** C4: GET /api/v1/courses/:courseId/chat/messages, keyset pagination. */
describe('C4 chat history', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: CourseFixture;
  /** Contents in chronological order, as inserted. */
  const contents: string[] = [];

  beforeAll(async () => {
    t = await learningApp('chat-history');
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
    // 25 messages. Every 5 share one millisecond and differ only in
    // microseconds, so a millisecond cursor would skip or repeat them.
    for (let i = 0; i < 25; i++) {
      const content = `m${String(i).padStart(2, '0')}`;
      contents.push(content);
      await t.db.query(
        `INSERT INTO chat_messages(course_id, sender_id, content, created_at)
         VALUES ($1, $2, $3,
           timestamptz '2026-10-01 08:00:00+00'
             + make_interval(secs => $4::float8 / 1000000))`,
        [
          course.id,
          i % 2 ? owner.id : student.id,
          content,
          Math.floor(i / 5) * 1000 + (i % 5),
        ],
      );
    }
  });
  afterAll(async () => {
    await t?.app.close();
  });

  const get = (user: Account, query = '', courseId = course.id) =>
    t
      .http()
      .get(`/api/v1/courses/${courseId}/chat/messages${query}`)
      .set('Cookie', user.session);
  const texts = (page: Page) => page.messages.map((m) => m.content);

  it('returns the latest page, oldest first, unenveloped', async () => {
    const response = await get(student, '?limit=10').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const page = response.body as Page;
    expect(texts(page)).toEqual(contents.slice(15));
    expect(page.hasMore).toBe(true);
    expect(page.messages[0]).toMatchObject({
      sender: { id: owner.id, name: 'instructor', avatarUrl: null },
      status: 'ACTIVE',
      createdAt: '2026-10-01T08:00:00.003000Z',
    });
  });

  it('walks back through every message exactly once with `cursor`', async () => {
    const seen: string[] = [];
    let page = (await get(student, '?limit=7').expect(200)).body as Page;
    seen.unshift(...texts(page));
    while (page.hasMore) {
      const cursor = page.messages[0].cursor;
      page = (await get(student, `?limit=7&cursor=${cursor}`).expect(200))
        .body as Page;
      seen.unshift(...texts(page));
    }
    expect(seen).toEqual(contents);
  });

  it('catches up forward with `after`, which is what a reconnect does', async () => {
    const latest = (await get(student, '?limit=10').expect(200)).body as Page;
    const lastSeen = latest.messages[3]; // the client missed the last 6
    const caughtUp = (
      await get(student, `?limit=4&after=${lastSeen.cursor}`).expect(200)
    ).body as Page;
    expect(texts(caughtUp)).toEqual(contents.slice(19, 23));
    expect(caughtUp.hasMore).toBe(true);
    const rest = (
      await get(
        student,
        `?limit=4&after=${caughtUp.messages.at(-1)!.cursor}`,
      ).expect(200)
    ).body as Page;
    expect(texts(rest)).toEqual(contents.slice(23));
    expect(rest.hasMore).toBe(false);

    const newest = rest.messages.at(-1)!.cursor;
    const nothing = (await get(student, `?after=${newest}`).expect(200))
      .body as Page;
    expect(nothing).toEqual({ messages: [], hasMore: false });
  });

  it('hides HIDDEN messages from learners, not from the instructor', async () => {
    const other = await t.course(owner, 1, [student]);
    await t.db.query(
      `INSERT INTO chat_messages(course_id, sender_id, content, status)
       VALUES ($1, $2, 'shown', 'ACTIVE'), ($1, $2, 'hidden', 'HIDDEN'),
              ($1, $2, 'flagged', 'FLAGGED')`,
      [other.id, student.id],
    );
    const asStudent = (await get(student, '', other.id).expect(200))
      .body as Page;
    expect(texts(asStudent).sort()).toEqual(['flagged', 'shown']);
    const asOwner = (await get(owner, '', other.id).expect(200)).body as Page;
    expect(texts(asOwner).sort()).toEqual(['flagged', 'hidden', 'shown']);
  });

  it('never serves course A history to a learner of course B', async () => {
    const outsider = await t.account();
    await t.course(owner, 1, [outsider]);
    expect((await get(outsider).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );
    // A cursor from course A does not open course B either.
    const page = (await get(student, '?limit=1').expect(200)).body as Page;
    const courseB = await t.course(owner, 1);
    expect(
      (
        await get(
          student,
          `?cursor=${page.messages[0].cursor}`,
          courseB.id,
        ).expect(403)
      ).body.code,
    ).toBe('ENROLLMENT_REQUIRED');
    await t
      .http()
      .get(`/api/v1/courses/${course.id}/chat/messages`)
      .expect(401);
  });

  it('rejects cursors it did not issue and bad paging input', async () => {
    const forged = Buffer.from('2026-13-01T00:00:00.000000Z|x').toString(
      'base64url',
    );
    for (const query of [
      '?cursor=garbage',
      `?cursor=${forged}`,
      `?after=${Buffer.from("x' OR 1=1 --").toString('base64url')}`,
    ])
      expect((await get(student, query).expect(400)).body.code, query).toBe(
        'CHAT_CURSOR_INVALID',
      );
    const page = (await get(student, '?limit=1').expect(200)).body as Page;
    const c = page.messages[0].cursor;
    expect(
      (await get(student, `?cursor=${c}&after=${c}`).expect(400)).body.code,
    ).toBe('CHAT_CURSOR_CONFLICT');
    await get(student, '?limit=0').expect(400);
    await get(student, '?limit=101').expect(400);
    await get(student, '?limit=abc').expect(400);
    await get(student, '?page=2').expect(400);
  });
});
