import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

type Session = {
  id: string;
  status: string;
  provider: string;
  embedUrl: string | null;
  isReplay: boolean;
  startTime: string;
  canManage: boolean;
};

const inMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

/** C10: live sessions, scheduled access and embed normalization. */
describe('C10 live sessions', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('live-sessions');
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(async () => {
    await t?.app.close();
  });

  const create = (user: Account, body: object, courseId = course.id) =>
    t.send(
      'post',
      `/api/v1/courses/${courseId}/live-sessions`,
      user.session,
      body,
    );
  const get = (user: Account, id: string) =>
    t.http().get(`/api/v1/live-sessions/${id}`).set('Cookie', user.session);
  const valid = (extra: object = {}) => ({
    title: 'Buổi 3: Closure và hoisting',
    startTime: inMinutes(15),
    endTime: inMinutes(75),
    embedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...extra,
  });
  /** Moves a session's window relative to now (minutes). */
  const shift = (id: string, start: number, end: number) =>
    t.db.query(
      `UPDATE live_sessions SET start_time = now() + make_interval(mins => $2),
         end_time = now() + make_interval(mins => $3) WHERE id = $1`,
      [id, start, end],
    );

  it('lets the teacher schedule a session and stores the embed form of the link', async () => {
    const response = await create(owner, valid()).expect(201);
    const session = response.body.session as Session;
    expect(session).toMatchObject({
      status: 'SCHEDULED',
      provider: 'YOUTUBE',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1',
      canManage: true,
    });
    expect(Date.parse(response.body.serverTime)).not.toBeNaN();
  });

  it('validates the window and the link', async () => {
    for (const body of [
      valid({ startTime: inMinutes(-5) }), // in the past
      valid({ endTime: inMinutes(10) }), // before the start
      valid({ endTime: inMinutes(15 + 13 * 60) }), // longer than 12 h
      valid({ startTime: 'tomorrow' }),
      valid({ title: '  ' }),
    ])
      await create(owner, body).expect(400);
    expect(
      (
        await create(
          owner,
          valid({ embedUrl: 'https://evil.example/live' }),
        ).expect(400)
      ).body.code,
    ).toBe('LIVE_EMBED_URL_INVALID');
    expect(
      (await create(owner, valid({ provider: 'VIMEO' })).expect(400)).body.code,
    ).toBe('LIVE_EMBED_PROVIDER_MISMATCH');
  });

  it('is scheduled by the course teachers only', async () => {
    expect((await create(student, valid()).expect(403)).body.code).toBe(
      'LIVE_SESSION_FORBIDDEN',
    );
    const stranger = await t.account('instructor');
    await create(stranger, valid()).expect(403);
  });

  it('AC1: refuses learners who are not enrolled (403)', async () => {
    const { body } = await create(owner, valid()).expect(201);
    const outsider = await t.account();
    const refused = await get(outsider, body.session.id).expect(403);
    expect(refused.body.code).toBe('ENROLLMENT_REQUIRED');
    await t
      .http()
      .get(`/api/v1/courses/${course.id}/live-sessions`)
      .set('Cookie', outsider.session)
      .expect(403);
  });

  it('AC2: withholds the embed URL from learners until the start', async () => {
    const { body } = await create(owner, valid()).expect(201);
    const id = body.session.id as string;

    const before = await get(student, id).expect(200);
    expect(before.body.session).toMatchObject({
      status: 'SCHEDULED',
      embedUrl: null,
    });
    // Not anywhere in the response, not even as another field.
    expect(JSON.stringify(before.body)).not.toContain('dQw4w9WgXcQ');
    const list = await t
      .http()
      .get(`/api/v1/courses/${course.id}/live-sessions`)
      .set('Cookie', student.session)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain('dQw4w9WgXcQ');

    await shift(id, -1, 59);
    const live = await get(student, id).expect(200);
    expect(live.body.session).toMatchObject({
      status: 'LIVE',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1',
      isReplay: false,
    });

    await shift(id, -120, -60);
    const ended = await get(student, id).expect(200);
    // YouTube keeps the recording: offered as a replay.
    expect(ended.body.session).toMatchObject({
      status: 'ENDED',
      isReplay: true,
    });
  });

  it('gives no replay of a Jitsi meeting, and nothing of a cancelled session', async () => {
    const jitsi = (
      await create(
        owner,
        valid({ embedUrl: 'https://meet.jit.si/Shanity-Buoi-3' }),
      ).expect(201)
    ).body.session as Session;
    await shift(jitsi.id, -120, -60);
    expect(
      (await get(student, jitsi.id).expect(200)).body.session,
    ).toMatchObject({
      provider: 'JITSI',
      status: 'ENDED',
      embedUrl: null,
    });

    const cancelled = (await create(owner, valid()).expect(201)).body
      .session as Session;
    await t
      .send(
        'patch',
        `/api/v1/live-sessions/${cancelled.id}/status`,
        owner.session,
        {
          status: 'CANCELLED',
        },
      )
      .expect(200);
    await shift(cancelled.id, -1, 59);
    expect(
      (await get(student, cancelled.id).expect(200)).body.session,
    ).toMatchObject({
      status: 'CANCELLED',
      embedUrl: null,
    });
  });

  it('lets the teacher end a live session early, and only that', async () => {
    const session = (await create(owner, valid()).expect(201)).body
      .session as Session;
    const end = (status: string, user = owner) =>
      t.send(
        'patch',
        `/api/v1/live-sessions/${session.id}/status`,
        user.session,
        { status },
      );
    await end('ENDED').expect(409); // not live yet
    await shift(session.id, -5, 55);
    await end('ENDED', student).expect(403);
    expect((await end('ENDED').expect(200)).body.session.status).toBe('ENDED');
    await end('CANCELLED').expect(409);
    await end('LIVE').expect(400);
  });

  it('lists the course timetable in order, with each status', async () => {
    const other = await t.course(owner, 1, [student]);
    const later = (
      await create(owner, valid({ title: 'Sau' }), other.id).expect(201)
    ).body.session as Session;
    const sooner = (
      await create(
        owner,
        valid({
          title: 'Trước',
          startTime: inMinutes(5),
          endTime: inMinutes(20),
        }),
        other.id,
      ).expect(201)
    ).body.session as Session;
    const list = await t
      .http()
      .get(`/api/v1/courses/${other.id}/live-sessions`)
      .set('Cookie', student.session)
      .expect(200);
    expect((list.body.sessions as Session[]).map((s) => s.id)).toEqual([
      sooner.id,
      later.id,
    ]);
    expect((list.body.sessions as Session[]).every((s) => !s.canManage)).toBe(
      true,
    );
  });

  it('lets an admin view any course session', async () => {
    const admin = await t.account('admin');
    const { body } = await create(owner, valid()).expect(201);
    expect(
      (await get(admin, body.session.id).expect(200)).body.session.embedUrl,
    ).toContain('youtube.com/embed');
  });
});
