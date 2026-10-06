import { learningApp, type Account } from './support/learning-fixture.js';

// lesson_progress has UNIQUE (user_id, lesson_id) and every write is an
// INSERT ... ON CONFLICT upsert, so duplicates collapse in the database
// itself: no application lock, no unique-violation 500s, no double counting.
describe('Completion idempotency and concurrency', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;

  beforeAll(async () => {
    t = await learningApp('concurrency');
    owner = await t.account('instructor');
  });
  afterAll(() => t?.app.close());

  const rowsFor = async (userId: string, lessonId: string) =>
    (await t.db.query(
      `SELECT status::text AS status, completed_at AS "completedAt"
         FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2`,
      [userId, lessonId],
    )) as Array<{ status: string; completedAt: Date }>;

  it('10 parallel completes of one lesson within 50ms: one row, all 200, exact %', async () => {
    const student = await t.account();
    const course = await t.course(owner, 4, [student]);
    const lesson = course.lessons[0]!;
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => t.complete(student.session, lesson.id)),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(10).fill(200),
    );
    for (const response of responses)
      expect(response.body.courseProgress).toMatchObject({
        completedRequiredLessons: 1,
        percentage: 25,
      });
    expect(await rowsFor(student.id, lesson.id)).toEqual([
      { status: 'COMPLETED', completedAt: expect.any(Date) },
    ]);
  });

  it('stress: 100 parallel completes stay a single row and 1 completion', async () => {
    const student = await t.account();
    const course = await t.course(owner, 2, [student]);
    const lesson = course.lessons[0]!;
    const responses = await Promise.all(
      Array.from({ length: 100 }, () => t.complete(student.session, lesson.id)),
    );
    expect(
      responses.filter((response) => response.status !== 200),
    ).toHaveLength(0);
    expect(await rowsFor(student.id, lesson.id)).toHaveLength(1);
    const { body } = await t.progress(student.session, course.id).expect(200);
    expect(body).toMatchObject({
      completedRequiredLessons: 1,
      completedLessons: 1,
      percentage: 50,
    });
  });

  it('a repeat completion keeps the original completedAt', async () => {
    const student = await t.account();
    const course = await t.course(owner, 1, [student]);
    const lesson = course.lessons[0]!;
    await t.complete(student.session, lesson.id).expect(200);
    const [first] = await rowsFor(student.id, lesson.id);
    await t.complete(student.session, lesson.id).expect(200);
    expect(await rowsFor(student.id, lesson.id)).toEqual([first]);
  });

  it('different lessons completed concurrently from several devices are all counted', async () => {
    const student = await t.account();
    const course = await t.course(owner, 10, [student]);
    const devices = [
      student.session,
      await t.login(student.email),
      await t.login(student.email),
    ];
    // Heartbeats and starts race with completions on the same rows.
    await Promise.all(
      course.lessons.flatMap((lesson, index) => [
        t.complete(devices[index % devices.length]!, lesson.id),
        t.send(
          'patch',
          `/lessons/${lesson.id}/progress/heartbeat`,
          devices[(index + 1) % devices.length]!,
          { lastPosition: 10 },
        ),
        t.send(
          'post',
          `/lessons/${lesson.id}/progress/start`,
          devices[(index + 2) % devices.length]!,
        ),
      ]),
    );
    const { body } = await t.progress(devices[1]!, course.id).expect(200);
    expect(body).toMatchObject({
      completedRequiredLessons: 10,
      percentage: 100,
      isCompleted: true,
    });
    // A later "start" or heartbeat never downgrades a completion.
    const statuses = (await t.db.query(
      `SELECT DISTINCT status::text AS status FROM lesson_progress
       WHERE user_id = $1 AND course_id = $2`,
      [student.id, course.id],
    )) as Array<{ status: string }>;
    expect(statuses).toEqual([{ status: 'COMPLETED' }]);
  });
});
