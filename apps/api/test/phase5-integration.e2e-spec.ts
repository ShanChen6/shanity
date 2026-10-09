import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../src/cache/memory-rate-limiter.js';
import { RateLimiter } from '../src/cache/rate-limiter.js';
import { RealtimeProvider } from '../src/modules/chat/realtime/realtime-provider.js';
import {
  ToxicityClassifier,
  type ToxicityResult,
} from '../src/modules/blog/moderation/toxicity-classifier.js';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from './support/learning-fixture.js';

/**
 * Phase 5 acceptance suite (Sprints 10 and 11): course chat isolation and
 * moderation, blog comment auto-moderation, live class gatekeeping and
 * heartbeat attendance, end to end through the real HTTP stack and guards.
 *
 * Only the outside world is replaced: the AI classifier answers a scripted
 * score, Pusher records instead of sending, and the rate limiter runs on a
 * clock the tests advance (so "30 s later" needs no real waiting).
 *
 * Run: pnpm --filter api test:e2e test/phase5-integration.e2e-spec.ts
 */

class ScriptedClassifier extends ToxicityClassifier {
  readonly provider = 'scripted';
  score = 0.02;
  classify(): Promise<ToxicityResult | null> {
    return Promise.resolve({
      score: this.score,
      categories: { harassment: this.score },
      provider: this.provider,
    });
  }
}

class RecordingRealtime extends RealtimeProvider {
  events: Array<{ channel: string; event: string }> = [];
  isAvailable() {
    return true;
  }
  authorizePresenceChannel() {
    return { auth: 'test' };
  }
  async publish(channel: string, event: string) {
    this.events.push({ channel, event });
  }
}

describe('Phase 5 integration (Sprint 10 + 11)', { timeout: 120_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  const ai = new ScriptedClassifier();
  const realtime = new RecordingRealtime();
  const clock = { now: Date.now() };
  let teacher: Account;
  let admin: Account;
  let studentA: Account;
  let courseA: CourseFixture;
  let courseB: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('phase5', (builder) =>
      builder
        .overrideProvider(ToxicityClassifier)
        .useValue(ai)
        .overrideProvider(RealtimeProvider)
        .useValue(realtime)
        .overrideProvider(RateLimiter)
        .useValue(new MemoryRateLimiter(10_000, () => clock.now)),
    );
    [teacher, admin, studentA] = await Promise.all([
      t.account('instructor'),
      t.account('admin'),
      t.account(),
    ]);
    const otherTeacher = await t.account('instructor');
    courseA = await t.course(teacher, 1, [studentA]);
    courseB = await t.course(otherTeacher, 1, [await t.account()]);
    // An established account: older than the trust window.
    await t.db.query(
      `UPDATE users SET created_at = now() - interval '30 days' WHERE id = $1`,
      [studentA.id],
    );
  });
  afterAll(async () => {
    await t?.app.close();
  });

  const get = (user: Account, path: string) =>
    t.http().get(path).set('Cookie', user.session);

  // ────────────────────────────────────────────────────────────────────────
  describe('A. Course chat isolation (Sprint 10)', () => {
    it('A1: a learner of course A can neither read nor post in course B (403)', async () => {
      const history = await get(
        studentA,
        `/api/v1/courses/${courseB.id}/chat/messages`,
      ).expect(403);
      expect(history.body.code).toBe('ENROLLMENT_REQUIRED');
      const send = await t
        .send(
          'post',
          `/api/v1/courses/${courseB.id}/chat/messages`,
          studentA.session,
          {
            content: 'xin chào lớp B',
          },
        )
        .expect(403);
      expect(send.body.code).toBe('ENROLLMENT_REQUIRED');
      // Nor join B's real-time channel.
      await t
        .send('post', '/api/v1/chat/auth', studentA.session, {
          socket_id: '123.456',
          channel_name: `presence-course-${courseB.id}`,
        })
        .expect(403);
      // Their own course works.
      await get(studentA, `/api/v1/courses/${courseA.id}/chat/messages`).expect(
        200,
      );
    });

    it('A2: a hidden message turns HIDDEN and leaves the learners’ history', async () => {
      const sent = await t
        .send(
          'post',
          `/api/v1/courses/${courseA.id}/chat/messages`,
          studentA.session,
          {
            content: `tin cần ẩn ${randomUUID().slice(0, 6)}`,
          },
        )
        .expect(201);
      const id = sent.body.id as string;
      await t
        .send('patch', `/api/v1/chat/messages/${id}/hide`, teacher.session, {
          reason: 'Lạc đề',
        })
        .expect(200);

      const [row] = await t.db.query(
        'SELECT status FROM chat_messages WHERE id = $1',
        [id],
      );
      expect(row.status).toBe('HIDDEN');
      const learnerView = await get(
        studentA,
        `/api/v1/courses/${courseA.id}/chat/messages`,
      ).expect(200);
      expect(JSON.stringify(learnerView.body)).not.toContain(sent.body.content);
      expect(realtime.events).toContainEqual({
        channel: `presence-course-${courseA.id}`,
        event: 'message_hidden',
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('B. Blog comments, automated moderation (Sprint 11, C9)', () => {
    let slug: string;

    beforeAll(async () => {
      const category = await t
        .send('post', '/api/v1/blog/categories', admin.session, {
          name: `Phase 5 ${randomUUID().slice(0, 6)}`,
        })
        .expect(201);
      const post = await t
        .send('post', '/api/v1/blog/posts', teacher.session, {
          title: `Bài kiểm thử ${randomUUID().slice(0, 6)}`,
          content: 'Nội dung bài viết',
          categoryId: category.body.id,
        })
        .expect(201);
      await t
        .send(
          'post',
          `/api/v1/blog/posts/${post.body.id}/submit`,
          teacher.session,
        )
        .expect(200);
      await t
        .send(
          'post',
          `/api/v1/blog/posts/${post.body.id}/publish`,
          admin.session,
        )
        .expect(200);
      slug = post.body.slug;
    });

    const comment = (content: string) =>
      t.send('post', `/api/v1/blog/posts/${slug}/comments`, studentA.session, {
        content,
      });
    const stored = async (id: string) =>
      (
        await t.db.query(
          'SELECT status, is_approved FROM post_comments WHERE id = $1',
          [id],
        )
      )[0];

    it('B1: a clean comment from an enrolled learner is approved at once', async () => {
      ai.score = 0.02;
      const response = await comment(
        'Bài viết rất hay, cảm ơn tác giả!',
      ).expect(200);
      expect(response.body.status).toBe('APPROVED');
      expect(await stored(response.body.comment.id)).toEqual({
        status: 'APPROVED',
        is_approved: true,
      });
      const thread = await t
        .http()
        .get(`/api/v1/blog/posts/${slug}/comments`)
        .expect(200);
      expect(thread.body.comments.map((c: { id: string }) => c.id)).toContain(
        response.body.comment.id,
      );
    });

    it('B2: profanity and junk links are rejected', async () => {
      for (const content of [
        'Bài viết như lồn',
        'Tài liệu giá rẻ tại https://re-qua.xyz',
      ]) {
        const response = await comment(content).expect(200);
        expect(response.body.status).toBe('REJECTED');
        expect(await stored(response.body.comment.id)).toEqual({
          status: 'REJECTED',
          is_approved: false,
        });
      }
    });

    it('B3: a borderline comment is held and shows up on the admin queue', async () => {
      ai.score = 0.5;
      const response = await comment(
        `Giải thích hơi ẩu ${randomUUID().slice(0, 4)}`,
      ).expect(200);
      expect(response.body).toMatchObject({
        status: 'PENDING',
        reason: 'SUSPICIOUS',
      });
      expect(await stored(response.body.comment.id)).toEqual({
        status: 'PENDING',
        is_approved: false,
      });
      const queue = await get(
        admin,
        '/api/v1/admin/comments?status=PENDING&limit=100',
      ).expect(200);
      expect(queue.body.data.map((c: { id: string }) => c.id)).toContain(
        response.body.comment.id,
      );
      ai.score = 0.02;
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('C. Live class access and heartbeat attendance (Sprint 11, C10/C11)', () => {
    /** A session of `minutes`, started `startedMinutesAgo` ago (negative: future). */
    async function liveSession(startedMinutesAgo: number, minutes: number) {
      const [row] = await t.db.query(
        `INSERT INTO live_sessions (course_id, instructor_id, title, start_time,
           end_time, embed_url, provider)
         VALUES ($1, $2, 'Buổi học', now() - make_interval(mins => $3::int),
           now() - make_interval(mins => $3::int) + make_interval(mins => $4::int),
           'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1', 'YOUTUBE')
         RETURNING id`,
        [courseA.id, teacher.id, startedMinutesAgo, minutes],
      );
      return row.id as string;
    }
    /** One valid heartbeat: 30 s after the previous one, on both clocks. */
    async function validPing(sessionId: string) {
      clock.now += 30_000;
      await t.db.query(
        `UPDATE live_attendances
         SET last_active_at = last_active_at - interval '30 seconds',
             first_joined_at = first_joined_at - interval '30 seconds'
         WHERE session_id = $1 AND student_id = $2`,
        [sessionId, studentA.id],
      );
      const response = await t
        .send(
          'post',
          `/api/v1/live-sessions/${sessionId}/heartbeat`,
          studentA.session,
        )
        .expect(200);
      expect(response.body.accepted).toBe(true);
      return response.body as { durationSeconds: number; isAttended: boolean };
    }

    it('C1: before the start, the session comes without its embed URL', async () => {
      const id = await liveSession(-15, 60);
      const response = await get(
        studentA,
        `/api/v1/live-sessions/${id}`,
      ).expect(200);
      expect(response.body.session).toMatchObject({
        status: 'SCHEDULED',
        embedUrl: null,
      });
      expect(JSON.stringify(response.body)).not.toContain('dQw4w9WgXcQ');
    });

    it('C2: ten valid heartbeats accumulate exactly 300 s', async () => {
      const id = await liveSession(5, 60);
      let last = { durationSeconds: 0, isAttended: false };
      for (let i = 0; i < 10; i++) last = await validPing(id);
      expect(last).toMatchObject({ durationSeconds: 300, isAttended: false });
      const [row] = await t.db.query(
        'SELECT duration_seconds FROM live_attendances WHERE session_id = $1 AND student_id = $2',
        [id, studentA.id],
      );
      expect(row.duration_seconds).toBe(300);
    });

    it('C3: reaching 50 % of the session marks the learner attended', async () => {
      // A 10-minute class: 300 s is the 50 % mark.
      const id = await liveSession(1, 10);
      for (let i = 0; i < 9; i++)
        expect((await validPing(id)).isAttended).toBe(false);
      expect(await validPing(id)).toMatchObject({
        durationSeconds: 300,
        isAttended: true,
      });
      const [row] = await t.db.query(
        'SELECT is_attended FROM live_attendances WHERE session_id = $1 AND student_id = $2',
        [id, studentA.id],
      );
      expect(row.is_attended).toBe(true);
      const report = await get(
        teacher,
        `/api/v1/courses/${courseA.id}/live-sessions/${id}/attendance-report`,
      ).expect(200);
      expect(
        report.body.students.find(
          (s: { studentId: string }) => s.studentId === studentA.id,
        ),
      ).toMatchObject({ status: 'PRESENT', durationSeconds: 300 });
    });
  });
});
