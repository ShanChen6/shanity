import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

const PUSHER = {
  PUSHER_APP_ID: '1',
  PUSHER_KEY: 'chat-key',
  PUSHER_SECRET: 'chat-secret',
  PUSHER_CLUSTER: 'ap1',
};
const SOCKET = '1234.5678';

/** C2: POST /api/v1/chat/auth signs presence-course-<id> for room members. */
describe('C2 chat channel authorization', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: CourseFixture;
  const channel = (courseId: string) => `presence-course-${courseId}`;

  beforeAll(async () => {
    Object.assign(process.env, PUSHER);
    t = await learningApp('chat-auth');
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(async () => {
    await t?.app.close();
    for (const name of Object.keys(PUSHER)) delete process.env[name];
  });

  const authorize = (
    user: Account | null,
    body: Record<string, string>,
    origin = process.env.WEB_ORIGIN!,
  ) => {
    const req = t.http().post('/api/v1/chat/auth').set('Origin', origin);
    if (user) req.set('Cookie', user.session);
    return req.send(body);
  };
  const join = (user: Account, courseId = course.id) =>
    authorize(user, { socket_id: SOCKET, channel_name: channel(courseId) });

  function expectSigned(
    body: { auth: string; channel_data: string },
    id: string,
  ) {
    const signature = createHmac('sha256', PUSHER.PUSHER_SECRET)
      .update(`${SOCKET}:${channel(id)}:${body.channel_data}`)
      .digest('hex');
    expect(body.auth).toBe(`${PUSHER.PUSHER_KEY}:${signature}`);
    return JSON.parse(body.channel_data) as {
      user_id: string;
      user_info: { name: string; avatarUrl: string | null; role: string };
    };
  }

  it('signs an enrolled student into the course room, unenveloped', async () => {
    const response = await join(student).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body).sort()).toEqual(['auth', 'channel_data']);
    expect(expectSigned(response.body, course.id)).toEqual({
      user_id: student.id,
      user_info: { name: 'student', avatarUrl: null, role: 'student' },
    });
  });

  it("accepts the Pusher client's default form-encoded body", async () => {
    const response = await t
      .http()
      .post('/api/v1/chat/auth')
      .set('Origin', process.env.WEB_ORIGIN!)
      .set('Cookie', student.session)
      .type('form')
      .send(`socket_id=${SOCKET}&channel_name=${channel(course.id)}`)
      .expect(200);
    expectSigned(response.body, course.id);
  });

  it('lets in the teachers of the course, tagged as instructors', async () => {
    const assigned = await t.account('instructor');
    await t.db.query(
      'INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)',
      [course.id, assigned.id],
    );
    for (const teacher of [owner, assigned]) {
      const member = expectSigned(
        (await join(teacher).expect(200)).body,
        course.id,
      );
      expect(member.user_info.role).toBe('instructor');
    }
  });

  it('does not treat a platform admin as a member (docs/permissions.md)', async () => {
    const admin = await t.account('admin');
    expect((await join(admin).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );
    // Enrolled like anyone else, an admin is in the room as a learner.
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [admin.id, course.id],
    );
    const member = expectSigned(
      (await join(admin).expect(200)).body,
      course.id,
    );
    expect(member.user_info.role).toBe('student');
  });

  it('never lets a learner of course A into course B', async () => {
    const otherOwner = await t.account('instructor');
    const courseB = await t.course(otherOwner, 1);
    expect((await join(student, courseB.id).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );
    // Valid membership of A, signature requested for B's channel in A's
    // name: the channel decides the course, so this is refused too.
    expect(
      (
        await authorize(student, {
          socket_id: SOCKET,
          channel_name: channel(courseB.id),
          course_id: course.id,
        }).expect(403)
      ).body.code,
    ).toBe('ENROLLMENT_REQUIRED');
  });

  it('re-checks membership on every request: a revocation bites at once', async () => {
    const learner = await t.account();
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [learner.id, course.id],
    );
    await join(learner).expect(200);
    await t.db.query(
      `UPDATE enrollments SET revoked_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [learner.id, course.id],
    );
    expect((await join(learner).expect(403)).body.code).toBe(
      'ENROLLMENT_SUSPENDED',
    );
  });

  it('keeps out anyone the course itself would keep out', async () => {
    const outsider = await t.account();
    expect((await join(outsider).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );

    const revoked = await t.account();
    await t.db.query(
      `INSERT INTO enrollments(user_id, course_id, revoked_at)
       VALUES ($1, $2, now())`,
      [revoked.id, course.id],
    );
    expect((await join(revoked).expect(403)).body.code).toBe(
      'ENROLLMENT_SUSPENDED',
    );

    // Another instructor's course: no authority, no enrollment.
    const other = await t.account('instructor');
    expect((await join(other).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );

    expect((await join(student, randomUUID()).expect(404)).body.code).toBe(
      'COURSE_NOT_FOUND',
    );
  });

  it('closes the room of an unpublished course to students only', async () => {
    const draft = await t.course(owner, 1, [student]);
    await t.db.query(`UPDATE courses SET status='draft' WHERE id=$1`, [
      draft.id,
    ]);
    expect((await join(student, draft.id).expect(403)).body.code).toBe(
      'COURSE_UNAVAILABLE',
    );
    await join(owner, draft.id).expect(200);
  });

  it('signs nothing but a lowercase course presence channel', async () => {
    for (const channel_name of [
      `private-course-${course.id}`,
      `presence-course-${course.id.toUpperCase()}`,
      'presence-admin',
      `presence-course-${course.id}-x`,
    ]) {
      const response = await authorize(student, {
        socket_id: SOCKET,
        channel_name,
      }).expect(403);
      expect(response.body.code, channel_name).toBe('CHAT_CHANNEL_FORBIDDEN');
    }
  });

  it('rejects malformed or unexpected input', async () => {
    const good = { socket_id: SOCKET, channel_name: channel(course.id) };
    await authorize(student, { ...good, socket_id: 'abc' }).expect(400);
    await authorize(student, { channel_name: good.channel_name }).expect(400);
    await authorize(student, { ...good, user_id: owner.id }).expect(400);
  });

  it('requires a session and the web origin', async () => {
    const body = { socket_id: SOCKET, channel_name: channel(course.id) };
    await authorize(null, body).expect(401);
    await authorize(student, body, 'https://evil.example').expect(403);
  });

  it('answers 503 while Pusher is not configured', async () => {
    delete process.env.PUSHER_SECRET;
    try {
      expect((await join(student).expect(503)).body.code).toBe(
        'CHAT_REALTIME_UNAVAILABLE',
      );
    } finally {
      process.env.PUSHER_SECRET = PUSHER.PUSHER_SECRET;
    }
  });
});
