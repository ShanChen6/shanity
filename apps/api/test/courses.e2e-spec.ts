import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Courses with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    const testIp = `courses-${randomUUID()}`;
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: testIp });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function account(role: 'student' | 'instructor' | 'admin') {
    const email = `${randomUUID()}@example.invalid`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({ email, password: 'Testing-a-long-password-42', displayName: role })
      .expect(201);
    const session = ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const [user] = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (role !== 'student')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  it('creates draft courses and scopes instructor reads by owner while admins see all', async () => {
    const instructor = await account('instructor');
    const otherInstructor = await account('instructor');
    const admin = await account('admin');
    const student = await account('student');
    const create = (session: string, slug: string, extra: object = {}) =>
      request(app.getHttpServer())
        .post('/courses')
        .set('Origin', origin)
        .set('Cookie', session)
        .send({ title: `Course ${slug}`, slug, ...extra });
    const update = (session: string, id: string, body: object) =>
      request(app.getHttpServer())
        .patch(`/courses/${id}`)
        .set('Origin', origin)
        .set('Cookie', session)
        .send(body);
    const publish = (session: string, id: string) =>
      request(app.getHttpServer())
        .post(`/courses/${id}/publish`)
        .set('Origin', origin)
        .set('Cookie', session);
    const archive = (session: string, id: string) =>
      request(app.getHttpServer())
        .post(`/courses/${id}/archive`)
        .set('Origin', origin)
        .set('Cookie', session);
    const publicList = (query: Record<string, string> = {}) =>
      request(app.getHttpServer()).get('/public/courses').query(query);

    await request(app.getHttpServer()).get('/courses').expect(401);
    await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', student.session)
      .expect(200)
      .expect([]);
    await create('', 'guest-course').expect(401);
    await create(student.session, 'student-course').expect(403);
    await update('', randomUUID(), { title: 'Guest mutation' }).expect(401);
    await create(instructor.session, 'forged', { status: 'published' }).expect(400);

    const owned = await create(instructor.session, 'owned-course', {
      description: 'Owned by instructor',
    }).expect(201);
    await update(student.session, owned.body.id, {
      title: 'Student update',
    }).expect(403);
    const other = await create(otherInstructor.session, 'other-course', {
      description: 'Complete course description',
      thumbnail: 'other-course.webp',
    }).expect(201);
    const adminCreated = await create(admin.session, 'admin-course').expect(201);

    expect(owned.body).toMatchObject({
      title: 'Course owned-course',
      slug: 'owned-course',
      description: 'Owned by instructor',
      status: 'draft',
      ownerId: instructor.id,
    });
    expect(other.body.ownerId).toBe(otherInstructor.id);
    expect(adminCreated.body.ownerId).toBe(admin.id);
    expect(
      await db.query('SELECT id FROM courses WHERE id=$1 AND status=$2', [
        owned.body.id,
        'draft',
      ]),
    ).toHaveLength(1);
    const instructorUpdate = await update(instructor.session, owned.body.id, {
      title: 'Course A updated by owner',
    }).expect(200);
    expect(instructorUpdate.body).toMatchObject({
      title: 'Course A updated by owner',
      ownerId: instructor.id,
      status: 'draft',
    });
    await update(otherInstructor.session, owned.body.id, {
      title: 'Unauthorized update',
    }).expect(403);
    await update(instructor.session, owned.body.id, {
      ownerId: otherInstructor.id,
    }).expect(400);
    await update(instructor.session, owned.body.id, {
      status: 'published',
    }).expect(400);
    await update(admin.session, owned.body.id, {
      title: 'Course A updated by admin',
    })
      .expect(200)
      .expect(({ body }) => {
        expect(body.ownerId).toBe(instructor.id);
      });

    const instructorList = await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', instructor.session)
      .expect(200);
    expect(instructorList.body.map((course: { id: string }) => course.id)).toEqual([
      owned.body.id,
    ]);
    await request(app.getHttpServer())
      .get(`/courses/${owned.body.id}`)
      .set('Cookie', instructor.session)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/courses/${other.body.id}`)
      .set('Cookie', instructor.session)
      .expect(403);
    await update(instructor.session, other.body.id, {
      title: 'Not the owner',
    }).expect(403);
    const missingId = randomUUID();
    await request(app.getHttpServer())
      .get(`/courses/${missingId}`)
      .set('Cookie', instructor.session)
      .expect(404);
    await update(instructor.session, missingId, { title: 'Missing' }).expect(404);

    const adminList = await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', admin.session)
      .expect(200);
    const adminCourseIds = adminList.body.map(
      (course: { id: string }) => course.id,
    );
    expect(adminCourseIds).toEqual(
      expect.arrayContaining([owned.body.id, other.body.id, adminCreated.body.id]),
    );
    await request(app.getHttpServer())
      .get(`/courses/${other.body.id}`)
      .set('Cookie', admin.session)
      .expect(200);
    await create(instructor.session, 'owned-course').expect(409);

    const publicBeforePublish = await publicList().expect(200);
    expect(
      publicBeforePublish.body.data.map((course: { id: string }) => course.id),
    ).not.toContain(other.body.id);

    const incomplete = await create(
      instructor.session,
      'incomplete-course',
    ).expect(201);
    const failedPublish = await publish(
      instructor.session,
      incomplete.body.id,
    ).expect(400);
    expect(failedPublish.body.message).toBe('Course is not ready to publish');
    expect(failedPublish.body.errors).toEqual(
      expect.arrayContaining([
        'Course description is required',
        'Course thumbnail is required',
        'At least one section is required',
      ]),
    );

    const [section] = await db.query(
      'INSERT INTO course_sections(course_id,title,position) VALUES ($1,$2,0) RETURNING id',
      [other.body.id, 'Main section'],
    );
    await publish(otherInstructor.session, other.body.id)
      .expect(400)
      .expect(({ body }) => {
        expect(body.errors).toContain(
          'Every section must contain at least one lesson',
        );
      });
    const [lesson] = await db.query(
      'INSERT INTO lessons(course_id,section_id,title,position) VALUES ($1,$2,$3,0) RETURNING id',
      [other.body.id, section.id, 'Lesson without content'],
    );
    await publish(otherInstructor.session, other.body.id)
      .expect(400)
      .expect(({ body }) => {
        expect(body.errors).toContain(
          'Every lesson must have text or video content',
        );
      });
    await db.query('UPDATE lessons SET body=$2 WHERE id=$1', [
      lesson.id,
      'Lesson content',
    ]);
    await publish(instructor.session, other.body.id).expect(403);
    const published = await publish(otherInstructor.session, other.body.id)
      .expect(201);
    expect(published.body).toMatchObject({
      status: 'published',
      publishedAt: expect.any(String),
    });
    await publish(otherInstructor.session, other.body.id).expect(409);
    const publicAfterPublish = await publicList().expect(200);
    expect(
      publicAfterPublish.body.data.map((course: { id: string }) => course.id),
    ).toContain(other.body.id);
    expect(
      publicAfterPublish.body.data.map((course: { id: string }) => course.id),
    ).not.toContain(owned.body.id);

    const studentList = await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', student.session)
      .expect(200);
    const studentCourseIds = studentList.body.map(
      (course: { id: string }) => course.id,
    );
    expect(studentCourseIds).toContain(other.body.id);
    expect(studentCourseIds).not.toContain(owned.body.id);
    await request(app.getHttpServer())
      .get(`/courses/${other.body.id}`)
      .set('Cookie', student.session)
      .expect(200);

    const archived = await archive(otherInstructor.session, other.body.id)
      .expect(201);
    expect(archived.body.status).toBe('archived');
    await archive(otherInstructor.session, other.body.id).expect(409);
    await publish(otherInstructor.session, other.body.id).expect(409);
    expect(
      (await publicList().expect(200)).body.data.map(
        (course: { id: string }) => course.id,
      ),
    ).not.toContain(other.body.id);
    await archive(instructor.session, incomplete.body.id).expect(201);
    await publish(instructor.session, incomplete.body.id).expect(409);
    await archive(admin.session, adminCreated.body.id)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('archived');
      });
  });

  it('serves only published courses with safe instructor projection and catalog filters', async () => {
    const instructor = await account('instructor');
    const createCourse = (title: string, slug: string, shortDescription: string) =>
      request(app.getHttpServer())
        .post('/courses')
        .set('Origin', origin)
        .set('Cookie', instructor.session)
        .send({
          title,
          slug,
          description: 'Catalog course description',
          shortDescription,
          thumbnail: `${slug}.webp`,
        });
    const publishReadyCourse = async (
      title: string,
      slug: string,
      shortDescription: string,
      assignInstructor: boolean,
    ) => {
      const course = await createCourse(title, slug, shortDescription)
        .expect(201)
        .then((result) => result.body);
      const [section] = await db.query(
        'INSERT INTO course_sections(course_id,title,position) VALUES ($1,$2,0) RETURNING id',
        [course.id, `${title} section`],
      );
      await db.query(
        'INSERT INTO lessons(course_id,section_id,title,body,position) VALUES ($1,$2,$3,$4,0)',
        [course.id, section.id, `${title} lesson`, 'Valid lesson content'],
      );
      if (assignInstructor)
        await db.query('UPDATE courses SET instructor_id=$2 WHERE id=$1', [
          course.id,
          instructor.id,
        ]);
      await request(app.getHttpServer())
        .post(`/courses/${course.id}/publish`)
        .set('Origin', origin)
        .set('Cookie', instructor.session)
        .expect(201);
      return course;
    };

    const titleMatch = await publishReadyCourse(
      'Needle title course',
      'needle-title-course',
      'A catalog description',
      true,
    );
    const descriptionMatch = await publishReadyCourse(
      'Second catalog course',
      'second-catalog-course',
      'Contains Needle in short description',
      false,
    );
    const draft = await createCourse(
      'Draft catalog course',
      'draft-catalog-course',
      'Not public',
    )
      .expect(201)
      .then((result) => result.body);
    const archived = await createCourse(
      'Archived catalog course',
      'archived-catalog-course',
      'Not public either',
    )
      .expect(201)
      .then((result) => result.body);
    await request(app.getHttpServer())
      .post(`/courses/${archived.id}/archive`)
      .set('Origin', origin)
      .set('Cookie', instructor.session)
      .expect(201);

    const all = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ status: 'DRAFT' })
      .expect(200);
    expect(all.body).toMatchObject({
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(all.body.data.map((course: { id: string }) => course.id)).toEqual(
      expect.arrayContaining([titleMatch.id, descriptionMatch.id]),
    );
    expect(all.body.data.map((course: { id: string }) => course.id)).not.toContain(
      draft.id,
    );
    expect(all.body.data.map((course: { id: string }) => course.id)).not.toContain(
      archived.id,
    );
    const visible = all.body.data.find(
      (course: { id: string }) => course.id === titleMatch.id,
    );
    expect(Object.keys(visible).sort()).toEqual(
      [
        'id',
        'title',
        'slug',
        'shortDescription',
        'thumbnail',
        'publishedAt',
        'instructor',
      ].sort(),
    );
    expect(visible.instructor).toEqual({
      id: instructor.id,
      displayName: 'instructor',
      avatar: null,
    });
    expect(visible.instructor).not.toHaveProperty('email');
    expect(visible.instructor).not.toHaveProperty('roles');

    const archivedFilter = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ status: 'ARCHIVED' })
      .expect(200);
    expect(archivedFilter.body.data.map((course: { id: string }) => course.id))
      .toEqual(expect.arrayContaining([titleMatch.id, descriptionMatch.id]));
    const searched = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ search: 'needle' })
      .expect(200);
    expect(searched.body.total).toBe(2);
    const instructorCourses = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ instructorId: instructor.id })
      .expect(200);
    expect(instructorCourses.body.data.map((course: { id: string }) => course.id))
      .toEqual([titleMatch.id]);

    const pageOne = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ page: 1, limit: 1, sortBy: 'createdAt', sortOrder: 'ASC' })
      .expect(200);
    const pageTwo = await request(app.getHttpServer())
      .get('/public/courses')
      .query({ page: 2, limit: 1, sortBy: 'createdAt', sortOrder: 'ASC' })
      .expect(200);
    expect(pageOne.body).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(pageTwo.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(pageOne.body.data[0].id).not.toBe(pageTwo.body.data[0].id);
    await request(app.getHttpServer())
      .get('/public/courses')
      .query({ limit: 51 })
      .expect(400);
  });

  it('serves published course detail and ordered chapter curriculum without private data', async () => {
    const instructor = await account('instructor');
    const create = (slug: string) =>
      request(app.getHttpServer())
        .post('/courses')
        .set('Origin', origin)
        .set('Cookie', instructor.session)
        .send({
          title: 'Course detail',
          slug,
          description: 'Full course description',
          shortDescription: 'Short detail',
          thumbnail: 'detail.webp',
        });
    const draft = await create('detail-draft').expect(201);
    await request(app.getHttpServer())
      .get(`/public/courses/${draft.body.slug}`)
      .expect(404);

    const published = await create('detail-published').expect(201);
    const [section] = await db.query(
      'INSERT INTO course_sections(course_id,title,position) VALUES ($1,$2,0) RETURNING id',
      [published.body.id, 'Course section'],
    );
    await db.query(
      'INSERT INTO lessons(course_id,section_id,title,body,position) VALUES ($1,$2,$3,$4,0)',
      [published.body.id, section.id, 'Course lesson', 'Lesson content'],
    );
    await request(app.getHttpServer())
      .post(`/courses/${published.body.id}/publish`)
      .set('Origin', origin)
      .set('Cookie', instructor.session)
      .expect(201);
    const [later] = await db.query(
      'INSERT INTO chapters(course_id,title,description,position) VALUES ($1,$2,$3,5) RETURNING id',
      [published.body.id, 'Later chapter', 'Later summary'],
    );
    const [earlier] = await db.query(
      'INSERT INTO chapters(course_id,title,description,position) VALUES ($1,$2,$3,1) RETURNING id',
      [published.body.id, 'First chapter', 'First summary'],
    );

    const detail = await request(app.getHttpServer())
      .get('/public/courses/detail-published')
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(
      ['course', 'instructor', 'curriculum'].sort(),
    );
    expect(detail.body.course).toMatchObject({
      id: published.body.id,
      title: 'Course detail',
      slug: 'detail-published',
      description: 'Full course description',
      shortDescription: 'Short detail',
      thumbnail: 'detail.webp',
    });
    expect(Object.keys(detail.body.course).sort()).toEqual(
      [
        'id',
        'title',
        'slug',
        'description',
        'shortDescription',
        'thumbnail',
        'publishedAt',
      ].sort(),
    );
    expect(detail.body.instructor).toEqual({
      id: instructor.id,
      displayName: 'instructor',
      avatar: null,
      bio: null,
    });
    expect(detail.body.instructor).not.toHaveProperty('email');
    expect(detail.body.instructor).not.toHaveProperty('roles');
    expect(
      detail.body.curriculum.map((chapter: { id: string }) => chapter.id),
    ).toEqual([earlier.id, later.id]);
    expect(detail.body.curriculum[0]).toEqual({
      id: earlier.id,
      title: 'First chapter',
      description: 'First summary',
      orderIndex: 1,
    });
    expect(detail.body.curriculum[1].orderIndex).toBe(5);
    expect(detail.body).not.toHaveProperty('lessons');

    const archived = await create('detail-archived').expect(201);
    await request(app.getHttpServer())
      .post(`/courses/${archived.body.id}/archive`)
      .set('Origin', origin)
      .set('Cookie', instructor.session)
      .expect(201);
    await request(app.getHttpServer())
      .get('/public/courses/detail-archived')
      .expect(404);
    await request(app.getHttpServer())
      .get('/public/courses/not-a-real-course')
      .expect(404);
  });
});