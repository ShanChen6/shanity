import type { ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChatMuteGuard } from '../../../src/modules/chat/guards/chat-mute.guard.js';
import { RealtimeProvider } from '../../../src/modules/chat/realtime/realtime-provider.js';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

type Published = { channel: string; event: string; data: unknown };

/** Records what would have gone to Pusher; can be told to fail. */
class FakeRealtime extends RealtimeProvider {
  published: Published[] = [];
  failing = false;
  isAvailable() {
    return true;
  }
  authorizePresenceChannel() {
    return { auth: 'fake' };
  }
  async publish(channel: string, event: string, data: unknown) {
    if (this.failing) throw new Error('pusher down');
    this.published.push({ channel, event, data });
  }
}

/** C5: reporting, hiding and muting in course chats. */
describe('C5 chat moderation', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  const realtime = new FakeRealtime();
  let owner: Account;
  let student: Account;
  let classmate: Account;
  let course: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('chat-moderation', (builder) =>
      builder.overrideProvider(RealtimeProvider).useValue(realtime),
    );
    owner = await t.account('instructor');
    student = await t.account();
    classmate = await t.account();
    course = await t.course(owner, 1, [student, classmate]);
  });
  afterAll(async () => {
    await t?.app.close();
  });
  beforeEach(() => {
    realtime.published = [];
    realtime.failing = false;
  });

  async function say(sender: Account, content = 'hello', courseId = course.id) {
    const [row] = await t.db.query(
      `INSERT INTO chat_messages(course_id, sender_id, content)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, sender.id, content],
    );
    return row.id as string;
  }
  const status = async (messageId: string) =>
    (
      await t.db.query('SELECT status FROM chat_messages WHERE id=$1', [
        messageId,
      ])
    )[0].status as string;

  const report = (user: Account, messageId: string, reason = 'spam') =>
    t.send('post', `/api/v1/chat/messages/${messageId}/report`, user.session, {
      reason,
    });
  const hide = (user: Account, messageId: string, body: object = {}) =>
    t.send(
      'patch',
      `/api/v1/chat/messages/${messageId}/hide`,
      user.session,
      body,
    );
  const mute = (user: Account, userId: string, body: object) =>
    t.send('post', `/api/v1/chat/users/${userId}/mute`, user.session, body);

  describe('POST /api/v1/chat/messages/:id/report', () => {
    it('files a pending report and flags the message', async () => {
      const id = await say(classmate);
      const response = await report(student, id, '  quảng cáo  ').expect(201);
      expect(response.body).toMatchObject({ messageId: id, status: 'PENDING' });
      expect(await status(id)).toBe('FLAGGED');
      const [row] = await t.db.query(
        'SELECT reporter_id, reason, status FROM chat_reports WHERE id=$1',
        [response.body.reportId],
      );
      expect(row).toEqual({
        reporter_id: student.id,
        reason: 'quảng cáo',
        status: 'PENDING',
      });
    });

    it('takes one report per reporter, not one per message', async () => {
      const id = await say(classmate);
      await report(student, id).expect(201);
      expect((await report(student, id).expect(409)).body.code).toBe(
        'CHAT_ALREADY_REPORTED',
      );
      await report(owner, id).expect(201);
    });

    it('refuses own, hidden, unknown and malformed targets', async () => {
      const own = await say(student);
      expect((await report(student, own).expect(400)).body.code).toBe(
        'CHAT_REPORT_OWN_MESSAGE',
      );
      const hidden = await say(classmate);
      await hide(owner, hidden).expect(200);
      expect((await report(student, hidden).expect(404)).body.code).toBe(
        'CHAT_MESSAGE_NOT_FOUND',
      );
      await report(student, randomUUID()).expect(404);
      await report(student, 'not-a-uuid').expect(400);
      await report(student, await say(classmate), '   ').expect(400);
    });

    it('is closed to anyone outside the course', async () => {
      const outsider = await t.account();
      await t.course(owner, 1, [outsider]);
      const id = await say(classmate);
      expect((await report(outsider, id).expect(403)).body.code).toBe(
        'ENROLLMENT_REQUIRED',
      );
      expect(await status(id)).toBe('ACTIVE');
    });
  });

  describe('PATCH /api/v1/chat/messages/:id/hide', () => {
    it('hides, resolves reports, audits and tells the room at once', async () => {
      const id = await say(classmate, 'xấu');
      await report(student, id).expect(201);
      const response = await hide(owner, id, { reason: 'Ngôn từ' }).expect(200);
      expect(response.body).toEqual({
        messageId: id,
        status: 'HIDDEN',
        resolvedReports: 1,
      });
      expect(await status(id)).toBe('HIDDEN');
      expect(
        await t.db.query(
          'SELECT status, resolved_by FROM chat_reports WHERE message_id=$1',
          [id],
        ),
      ).toEqual([{ status: 'RESOLVED', resolved_by: owner.id }]);
      expect(
        await t.db.query(
          `SELECT actor_id, action, reason FROM chat_moderation_logs
           WHERE message_id=$1`,
          [id],
        ),
      ).toEqual([
        { actor_id: owner.id, action: 'HIDE_MESSAGE', reason: 'Ngôn từ' },
      ]);
      expect(realtime.published).toEqual([
        {
          channel: `presence-course-${course.id}`,
          event: 'message_hidden',
          data: { messageId: id },
        },
      ]);
      // Learners no longer get it from history.
      const history = await t
        .http()
        .get(`/api/v1/courses/${course.id}/chat/messages`)
        .set('Cookie', student.session)
        .expect(200);
      expect(
        history.body.messages.map((m: { id: string }) => m.id),
      ).not.toContain(id);
    });

    it('is idempotent: a second hide changes, logs and sends nothing', async () => {
      const id = await say(classmate);
      await hide(owner, id).expect(200);
      realtime.published = [];
      const again = await hide(owner, id).expect(200);
      expect(again.body.resolvedReports).toBe(0);
      expect(realtime.published).toEqual([]);
      const logs = await t.db.query(
        'SELECT 1 FROM chat_moderation_logs WHERE message_id=$1',
        [id],
      );
      expect(logs).toHaveLength(1);
    });

    it('lets a platform admin moderate a room they are not in', async () => {
      const admin = await t.account('admin');
      const id = await say(classmate);
      await hide(admin, id).expect(200);
      expect(await status(id)).toBe('HIDDEN');
    });

    it('is refused to learners and to teachers of other courses', async () => {
      const id = await say(classmate);
      expect((await hide(student, id).expect(403)).body.code).toBe(
        'CHAT_MODERATION_FORBIDDEN',
      );
      const stranger = await t.account('instructor');
      expect((await hide(stranger, id).expect(403)).body.code).toBe(
        'CHAT_MODERATION_FORBIDDEN',
      );
      expect(await status(id)).toBe('ACTIVE');
      await hide(owner, randomUUID()).expect(404);
    });

    it('still hides when the real-time provider is down', async () => {
      realtime.failing = true;
      const id = await say(classmate);
      await hide(owner, id).expect(200);
      expect(await status(id)).toBe('HIDDEN');
    });

    it('keeps the moderation log append-only', async () => {
      const id = await say(classmate);
      await hide(owner, id).expect(200);
      await expect(
        t.db.query(
          `UPDATE chat_moderation_logs SET reason = 'x' WHERE message_id=$1`,
          [id],
        ),
      ).rejects.toMatchObject({
        constraint: 'TRG_chat_moderation_logs_immutable',
      });
      await expect(
        t.db.query('DELETE FROM chat_moderation_logs WHERE message_id=$1', [
          id,
        ]),
      ).rejects.toMatchObject({
        constraint: 'TRG_chat_moderation_logs_immutable',
      });
    });
  });

  describe('POST /api/v1/chat/users/:userId/mute', () => {
    const muteGuard = () => t.app.get(ChatMuteGuard);
    const sendContext = (user: Account, role: 'student' | 'instructor') =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            principal: { id: user.id },
            chatMember: { role },
            chatCourseId: course.id,
          }),
        }),
      }) as unknown as ExecutionContext;

    it('mutes for the given time, audits, tells the room and blocks sending', async () => {
      const learner = await t.account();
      await t.db.query(
        'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
        [learner.id, course.id],
      );
      await expect(
        muteGuard().canActivate(sendContext(learner, 'student')),
      ).resolves.toBe(true);

      const before = Date.now();
      const response = await mute(owner, learner.id, {
        courseId: course.id,
        durationMinutes: 30,
        reason: 'Spam',
      }).expect(200);
      const until = Date.parse(response.body.mutedUntil);
      expect(until - before).toBeGreaterThan(29 * 60_000);
      expect(until - before).toBeLessThan(31 * 60_000);
      expect(realtime.published).toEqual([
        {
          channel: `presence-course-${course.id}`,
          event: 'user_muted',
          data: { userId: learner.id, mutedUntil: response.body.mutedUntil },
        },
      ]);
      const [log] = await t.db.query(
        `SELECT action, actor_id, reason FROM chat_moderation_logs
         WHERE target_user_id=$1`,
        [learner.id],
      );
      expect(log).toEqual({
        action: 'MUTE_USER',
        actor_id: owner.id,
        reason: 'Spam',
      });

      await expect(
        muteGuard().canActivate(sendContext(learner, 'student')),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'CHAT_MUTED', mutedUntil: response.body.mutedUntil },
      });

      // Muting again replaces the deadline; once it passes, sending is back.
      await mute(owner, learner.id, {
        courseId: course.id,
        durationMinutes: 5,
      }).expect(200);
      const [{ count }] = await t.db.query(
        'SELECT count(*)::int AS count FROM chat_mutes WHERE user_id=$1',
        [learner.id],
      );
      expect(count).toBe(1);
      await t.db.query(
        `UPDATE chat_mutes SET muted_until = now() - interval '1 second'
         WHERE user_id=$1`,
        [learner.id],
      );
      await expect(
        muteGuard().canActivate(sendContext(learner, 'student')),
      ).resolves.toBe(true);
    });

    it('cannot silence the course teachers or oneself', async () => {
      const assigned = await t.account('instructor');
      await t.db.query(
        'INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)',
        [course.id, assigned.id],
      );
      const body = { courseId: course.id, durationMinutes: 10 };
      for (const target of [assigned, owner])
        expect((await mute(owner, target.id, body).expect(403)).body.code).toBe(
          'CHAT_MUTE_TARGET_FORBIDDEN',
        );
      expect(realtime.published).toEqual([]);
    });

    it('is for moderators of that very course only', async () => {
      const body = { courseId: course.id, durationMinutes: 10 };
      expect(
        (await mute(student, classmate.id, body).expect(403)).body.code,
      ).toBe('CHAT_MODERATION_FORBIDDEN');
      const stranger = await t.account('instructor');
      await mute(stranger, classmate.id, body).expect(403);
      await mute(owner, randomUUID(), body).expect(404);
      await mute(owner, classmate.id, {
        ...body,
        courseId: randomUUID(),
      }).expect(404);
    });

    it('validates the duration and the course', async () => {
      for (const body of [
        { courseId: course.id, durationMinutes: 0 },
        { courseId: course.id, durationMinutes: 30 * 24 * 60 + 1 },
        { courseId: course.id, durationMinutes: 1.5 },
        { durationMinutes: 10 },
        { courseId: 'x', durationMinutes: 10 },
      ])
        await mute(owner, classmate.id, body).expect(400);
    });
  });

  it('requires the web origin on every moderation write', async () => {
    const id = await say(classmate);
    await t
      .http()
      .patch(`/api/v1/chat/messages/${id}/hide`)
      .set('Cookie', owner.session)
      .send({})
      .expect(403);
    expect(await status(id)).toBe('ACTIVE');
  });
});
