import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

type Account = { id: string; session: string };

describe('Instructor student progress dashboard', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;
  let owner: Account;
  let otherInstructor: Account;
  let admin: Account;
  let outsider: Account;
  let courseId: string;
  const students: Record<'a' | 'b' | 'c' | 'd' | 'e', Account> = {} as never;
  let lessonIds: string[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', {
        value: `instructor-progress-${randomUUID()}`,
      });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;

    owner = await account('instructor', 'Owner');
    otherInstructor = await account('instructor', 'Other');
    admin = await account('admin', 'Admin');
    outsider = await account('student', 'Outsider');
    for (const key of ['a', 'b', 'c', 'd', 'e'] as const)
      students[key] = await account('student', `Student ${key.toUpperCase()}`);

    courseId = await post('/courses', owner.session, {
      title: 'NestJS Fundamentals',
      slug: `nestjs-${randomUUID()}`,
    }).then(({ body }) => body.id as string);
    const chapterId = await post(
      `/courses/${courseId}/chapters`,
      owner.session,
      {
        title: 'Core',
      },
    ).then(({ body }) => body.id as string);
    // 20 required lessons: 16 = 80%, 9 = 45%, 2 = 10%.
    lessonIds = [];
    for (let index = 0; index < 20; index++)
      lessonIds.push(
        await post(`/chapters/${chapterId}/lessons`, owner.session, {
          title: `Lesson ${index + 1}`,
          type: 'TEXT',
          content: { textBody: '<p>Body</p>' },
        }).then(({ body }) => body.id as string),
      );
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [courseId],
    );
    const completed = { a: 16, b: 9, c: 2, d: 0, e: 20 };
    const accessed = {
      a: '2026-10-06T14:20:00Z',
      b: '2026-10-05T09:10:00Z',
      c: '2026-09-21T07:30:00Z',
      d: null,
      e: '2026-10-01T00:00:00Z',
    };
    for (const key of ['a', 'b', 'c', 'd', 'e'] as const) {
      await db.query(
        `INSERT INTO enrollments(user_id, course_id, last_accessed_at)
         VALUES ($1, $2, $3)`,
        [students[key].id, courseId, accessed[key]],
      );
      for (const lessonId of lessonIds.slice(0, completed[key]))
        await db.query(
          `INSERT INTO lesson_progress
            (id, user_id, lesson_id, course_id, status, last_position,
             started_at, last_accessed_at, completed_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'COMPLETED', 0,
                   now(), now(), now())`,
          [students[key].id, lessonId, courseId],
        );
    }
  });

  afterAll(() => app?.close());

  async function account(
    role: 'student' | 'instructor' | 'admin',
    displayName: string,
  ): Promise<Account> {
    const email = `${randomUUID()}@example.invalid`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({ email, password: 'Testing-a-long-password-42', displayName })
      .expect(201);
    const session = (
      (response.headers['set-cookie'] as unknown as string[]) ?? []
    )
      .map((value) => value.split(';')[0])
      .join('; ');
    const [user] = await db.query('SELECT id FROM users WHERE email=$1', [
      email,
    ]);
    if (role !== 'student')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  const post = (path: string, session: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body)
      .expect(201);

  const list = (session: string | null, query = '', id = courseId) => {
    const req = request(app.getHttpServer()).get(
      `/instructor/courses/${id}/students-progress${query}`,
    );
    return session ? req.set('Cookie', session) : req;
  };
  const byName = (body: { students: Array<{ fullName: string }> }) =>
    body.students.map((student) => student.fullName);

  it('enforces RBAC and ownership (no IDOR)', async () => {
    await list(null).expect(401);
    await list(students.a.session).expect(403);
    await list(outsider.session).expect(403);
    const denied = await list(otherInstructor.session).expect(403);
    expect(denied.body.message).toBe(
      'You do not have permission to view progress for this course',
    );
    // Unknown course: same 403 for instructors, so ids cannot be probed.
    await list(otherInstructor.session, '', randomUUID()).expect(403);
    await list(admin.session, '', randomUUID()).expect(404);
    await list(admin.session).expect(200);
    await list(owner.session).expect(200);
    // The detail endpoint shares the guard.
    await request(app.getHttpServer())
      .get(`/instructor/courses/${courseId}/students/${students.a.id}/progress`)
      .set('Cookie', otherInstructor.session)
      .expect(403);
  });

  it('reports progress identical to the P5 engine formula', async () => {
    const { body } = await list(owner.session, '?sortBy=percentage_desc');
    expect(body.course).toMatchObject({
      id: courseId,
      title: 'NestJS Fundamentals',
      totalStudents: 5,
      avgProgressPercentage: 47, // (100 + 80 + 45 + 10 + 0) / 5
      completedStudents: 1,
      completionRate: 20,
    });
    const rows = Object.fromEntries(
      body.students.map(
        (student: {
          fullName: string;
          status: string;
          progress: { percentage: number; completedLessons: number };
        }) => [student.fullName, student],
      ),
    );
    expect(rows['Student A']).toMatchObject({
      status: 'IN_PROGRESS',
      progress: { percentage: 80, completedLessons: 16, totalLessons: 20 },
    });
    expect(rows['Student B'].progress.percentage).toBe(45);
    expect(rows['Student C'].progress.percentage).toBe(10);
    expect(rows['Student D']).toMatchObject({
      status: 'NOT_STARTED',
      lastAccessedAt: null,
    });
    expect(rows['Student E'].status).toBe('COMPLETED');
    expect(byName(body)).toEqual([
      'Student E',
      'Student A',
      'Student B',
      'Student C',
      'Student D',
    ]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      totalItems: 5,
      totalPages: 1,
    });
  });

  it('searches by name or email and filters by status', async () => {
    const named = await list(owner.session, '?search=Student%20B').expect(200);
    expect(byName(named.body)).toEqual(['Student B']);
    // Wildcards are literal, not "match everything".
    const literal = await list(owner.session, '?search=%25').expect(200);
    expect(literal.body.students).toHaveLength(0);

    const completed = await list(owner.session, '?status=COMPLETED');
    expect(byName(completed.body)).toEqual(['Student E']);
    const notStarted = await list(owner.session, '?status=NOT_STARTED');
    expect(byName(notStarted.body)).toEqual(['Student D']);
    // Summary cards stay course-wide while the table is filtered.
    expect(notStarted.body.course.totalStudents).toBe(5);
  });

  it('sorts and paginates', async () => {
    const recent = await list(owner.session, '?sortBy=last_accessed_desc');
    expect(byName(recent.body)).toEqual([
      'Student A',
      'Student B',
      'Student E',
      'Student C',
      'Student D',
    ]);
    const page = await list(
      owner.session,
      '?sortBy=percentage_asc&limit=2&page=2',
    );
    expect(byName(page.body)).toEqual(['Student B', 'Student A']);
    expect(page.body.pagination).toEqual({
      page: 2,
      limit: 2,
      totalItems: 5,
      totalPages: 3,
    });
    await list(owner.session, '?limit=1000').expect(400);
    await list(owner.session, '?sortBy=hacked').expect(400);
  });

  it('lists one enrolled student’s lesson statuses for the drawer', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/instructor/courses/${courseId}/students/${students.c.id}/progress`)
      .set('Cookie', owner.session)
      .expect(200);
    expect(detail.body.fullName).toBe('Student C');
    expect(detail.body.lessons).toHaveLength(20);
    expect(
      detail.body.lessons.filter(
        (lesson: { status: string }) => lesson.status === 'COMPLETED',
      ),
    ).toHaveLength(2);
    // A user outside the course is not exposed through this course.
    await request(app.getHttpServer())
      .get(`/instructor/courses/${courseId}/students/${outsider.id}/progress`)
      .set('Cookie', owner.session)
      .expect(404);
  });
});
