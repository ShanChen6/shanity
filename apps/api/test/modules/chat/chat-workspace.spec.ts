import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RealtimeProvider } from '../../../src/modules/chat/realtime/realtime-provider.js';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

type Published = { channel: string; event: string; data: unknown };

class FakeRealtime extends RealtimeProvider {
  published: Published[] = [];
  isAvailable() {
    return true;
  }
  authorizePresenceChannel() {
    return { auth: 'fake' };
  }
  async publish(channel: string, event: string, data: unknown) {
    this.published.push({ channel, event, data });
  }
}

/**
 * C6 backend: sending (wires C3's flood limit and C5's mute), the caller's
 * standing, the moderation queue and dismissing reports.
 */
describe('C6 chat workspace API', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  const realtime = new FakeRealtime();
  let owner: Account;
  let student: Account;
  let course: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('chat-workspace', (builder) =>
      builder.overrideProvider(RealtimeProvider).useValue(realtime),
    );
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(async () => {
    await t?.app.close();
  });
  beforeEach(() => {
    realtime.published = [];
  });

  const send = (user: Account, content: string, courseId = course.id) =>
    t.send('post', `/api/v1/courses/${courseId}/chat/messages`, user.session, {
      content,
    });
  const me = (user: Account, courseId = course.id) =>
    t
      .http()
      .get(`/api/v1/courses/${courseId}/chat/me`)
      .set('Cookie', user.session);
  const queue = (user: Account, query = '') =>
    t
      .http()
      .get(`/api/v1/chat/moderation/queue${query}`)
      .set('Cookie', user.session);
  const report = (user: Account, id: string, reason = 'spam') =>
    t.send('post', `/api/v1/chat/messages/${id}/report`, user.session, {
      reason,
    });
  const dismiss = (user: Account, id: string) =>
    t.send('post', `/api/v1/chat/messages/${id}/dismiss`, user.session, {});
  async function learner(courseId = course.id) {
    const account = await t.account();
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [account.id, courseId],
    );
    return account;
  }

  describe('POST /api/v1/courses/:courseId/chat/messages', () => {
    it('stores, returns and announces the message', async () => {
      const response = await send(student, '  Chào cả lớp  ').expect(201);
      expect(response.body).toMatchObject({
        content: 'Chào cả lớp',
        status: 'ACTIVE',
        sender: { id: student.id, name: 'student' },
        attachments: [],
      });
      expect(realtime.published).toEqual([
        {
          channel: `presence-course-${course.id}`,
          event: 'message_created',
          data: response.body,
        },
      ]);
      // The returned cursor pages like any history message.
      const history = await t
        .http()
        .get(
          `/api/v1/courses/${course.id}/chat/messages?after=${response.body.cursor}`,
        )
        .set('Cookie', student.session)
        .expect(200);
      expect(history.body).toEqual({ messages: [], hasMore: false });
    });

    it('allows 5 messages in 3 seconds, then answers 429', async () => {
      const sender = await learner();
      for (let i = 0; i < 5; i++) await send(sender, `m${i}`).expect(201);
      const refused = await send(sender, 'm5').expect(429);
      expect(refused.body.code).toBe('CHAT_RATE_LIMITED');
      expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      const [{ n }] = await t.db.query(
        'SELECT count(*)::int AS n FROM chat_messages WHERE sender_id=$1',
        [sender.id],
      );
      expect(n).toBe(5);
    });

    it('refuses a muted member without spending their flood budget', async () => {
      const muted = await learner();
      await t.send(
        'post',
        `/api/v1/chat/users/${muted.id}/mute`,
        owner.session,
        {
          courseId: course.id,
          durationMinutes: 10,
        },
      );
      for (let i = 0; i < 7; i++) {
        const response = await send(muted, 'xin chào').expect(403);
        expect(response.body.code).toBe('CHAT_MUTED');
      }
      expect((await me(muted).expect(200)).body.mutedUntil).toEqual(
        expect.any(String),
      );
      await t.db.query(`DELETE FROM chat_mutes WHERE user_id=$1`, [muted.id]);
      await send(muted, 'đã được mở').expect(201);
    });

    it('is for members only, with sane content and the web origin', async () => {
      const outsider = await t.account();
      expect((await send(outsider, 'hi').expect(403)).body.code).toBe(
        'ENROLLMENT_REQUIRED',
      );
      await send(student, '   ').expect(400);
      await send(student, 'x'.repeat(2001)).expect(400);
      await t
        .http()
        .post(`/api/v1/courses/${course.id}/chat/messages`)
        .set('Cookie', student.session)
        .send({ content: 'no origin' })
        .expect(403);
      expect(realtime.published).toEqual([]);
    });
  });

  it('GET /chat/me tells the UI the caller role and mute', async () => {
    expect((await me(owner).expect(200)).body).toEqual({
      courseId: course.id,
      role: 'instructor',
      mutedUntil: null,
    });
    expect((await me(student).expect(200)).body).toMatchObject({
      role: 'student',
      mutedUntil: null,
    });
    await me(await t.account()).expect(403);
  });

  describe('moderation queue and dismissal', () => {
    it('lists pending reports per message, newest report first, own courses only', async () => {
      const author = await learner();
      const otherOwner = await t.account('instructor');
      const otherCourse = await t.course(otherOwner, 1);
      const reporterA = await learner();
      const reporterB = await learner();
      const first = (await send(author, 'tin một').expect(201)).body.id;
      const second = (await send(author, 'tin hai').expect(201)).body.id;
      const elsewhere = await learner(otherCourse.id);
      const foreign = (
        await send(elsewhere, 'khóa khác', otherCourse.id).expect(201)
      ).body.id;
      await report(reporterA, first, 'Spam').expect(201);
      await report(reporterB, first, 'Quảng cáo').expect(201);
      await report(reporterA, second).expect(201);
      await report(await learner(otherCourse.id), foreign).expect(201);

      const mine = (await queue(owner).expect(200)).body as Array<{
        message: { id: string; status: string };
        course: { id: string };
        reportCount: number;
        reports: Array<{ reason: string; reporter: { id: string } }>;
      }>;
      const ids = mine.map((item) => item.message.id);
      expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
      expect(ids).not.toContain(foreign);
      const firstItem = mine.find((item) => item.message.id === first)!;
      expect(firstItem).toMatchObject({
        course: { id: course.id },
        reportCount: 2,
        message: { status: 'FLAGGED' },
      });
      expect(firstItem.reports.map((r) => r.reason)).toEqual([
        'Spam',
        'Quảng cáo',
      ]);

      // Admins see every course; a course filter narrows it.
      const admin = await t.account('admin');
      const all = (await queue(admin).expect(200)).body as Array<{
        message: { id: string };
      }>;
      expect(all.map((item) => item.message.id)).toEqual(
        expect.arrayContaining([first, foreign]),
      );
      const filtered = (
        await queue(admin, `?courseId=${otherCourse.id}`).expect(200)
      ).body as Array<{ course: { id: string } }>;
      expect(filtered.every((item) => item.course.id === otherCourse.id)).toBe(
        true,
      );
      expect(
        (await queue(owner, `?courseId=${otherCourse.id}`).expect(403)).body
          .code,
      ).toBe('CHAT_MODERATION_FORBIDDEN');
      expect((await queue(student).expect(200)).body).toEqual([]);
    });

    it('dismisses unfounded reports: resolved, unflagged, audited, gone from the queue', async () => {
      const author = await learner();
      const id = (await send(author, 'bình thường').expect(201)).body.id;
      await report(await learner(), id).expect(201);
      const response = await dismiss(owner, id).expect(200);
      expect(response.body).toEqual({
        messageId: id,
        status: 'ACTIVE',
        dismissedReports: 1,
      });
      const [message] = await t.db.query(
        'SELECT status FROM chat_messages WHERE id=$1',
        [id],
      );
      expect(message.status).toBe('ACTIVE');
      expect(
        await t.db.query(
          `SELECT action FROM chat_moderation_logs WHERE message_id=$1`,
          [id],
        ),
      ).toEqual([{ action: 'DISMISS_REPORTS' }]);
      const items = (await queue(owner).expect(200)).body as Array<{
        message: { id: string };
      }>;
      expect(items.map((item) => item.message.id)).not.toContain(id);
      // Again: nothing left to dismiss, nothing logged.
      expect((await dismiss(owner, id).expect(200)).body.dismissedReports).toBe(
        0,
      );
    });

    it('never unhides a hidden message and is for moderators only', async () => {
      const author = await learner();
      const id = (await send(author, 'xấu').expect(201)).body.id;
      await t
        .send('patch', `/api/v1/chat/messages/${id}/hide`, owner.session, {})
        .expect(200);
      expect((await dismiss(owner, id).expect(200)).body).toMatchObject({
        status: 'HIDDEN',
        dismissedReports: 0,
      });
      const other = (await send(author, 'khác').expect(201)).body.id;
      expect((await dismiss(student, other).expect(403)).body.code).toBe(
        'CHAT_MODERATION_FORBIDDEN',
      );
      await dismiss(owner, randomUUID()).expect(404);
    });
  });
});
