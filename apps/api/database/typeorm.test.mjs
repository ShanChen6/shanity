import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../dist/database/typeorm.js';
import { migrateDatabase } from '../dist/database/migrate.js';
import {
  migrationHistory,
  migrations,
} from '../dist/database/migrations/index.js';
import { Course } from '../dist/courses/course.entity.js';
import { Chapter } from '../dist/courses/chapter.entity.js';
import { Enrollment } from '../dist/courses/enrollment.entity.js';
import {
  Lesson,
  LessonType,
} from '../dist/modules/lessons/entities/lesson.entity.js';
import { CoursesService } from '../dist/courses/courses.service.js';
import { CourseAccessService } from '../dist/courses/course-access.service.js';
import { User } from '../dist/users/user.entity.js';
import { CourseStatus } from '../dist/courses/course-status.js';
import {
  LessonProgress,
  LessonProgressStatus,
} from '../dist/modules/progress/entities/lesson-progress.entity.js';
import { ProgressService } from '../dist/modules/progress/progress.service.js';
import { CourseProgressEngine } from '../dist/modules/progress/services/course-progress-engine.service.js';
import { ResumeLearningService } from '../dist/modules/progress/services/resume-learning.service.js';
import { seed as seedDemo } from './seeds/001_demo.mjs';
import { seed as seedAdmin } from './seeds/002_super_admin.mjs';

const options = createAppDataSource().options;
if (!options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

async function isolated(run) {
  const schema = `orm_${randomUUID().replaceAll('-', '')}`;
  const admin = await new DataSource(options).initialize();
  let db;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      ...options,
      schema,
      extra: {
        ...options.extra,
        options: `-c timezone=UTC -c search_path=${schema},public`,
      },
    }).initialize();
    await run(db, schema);
  } finally {
    if (db?.isInitialized) await db.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  }
}
const rejectsCode = (query, code, constraint) =>
  assert.rejects(
    query,
    (error) =>
      error.code === code && (!constraint || error.constraint === constraint),
  );

async function legacy(db, count = 6) {
  // Frozen pre-TypeORM SQL, independent of the migrated TypeScript classes.
  await db.query(
    await readFile(
      new URL('./fixtures/legacy-schema.sql', import.meta.url),
      'utf8',
    ),
  );
  if (count === 7) {
    const runner = db.createQueryRunner();
    try {
      await new migrations[6]().up(runner);
    } finally {
      await runner.release();
    }
  }
  await db.query(
    'CREATE TABLE knex_migrations(id serial PRIMARY KEY, name varchar(255), batch integer, migration_time timestamptz)',
  );
  await db.query(
    'CREATE TABLE knex_migrations_lock("index" serial PRIMARY KEY, is_locked integer)',
  );
  await db.query('INSERT INTO knex_migrations_lock(is_locked) VALUES (0)');
  for (const entry of migrationHistory.slice(0, count)) {
    await db.query(
      'INSERT INTO knex_migrations(name,batch,migration_time) VALUES ($1,1,now())',
      [entry.legacy],
    );
  }
}

test('fresh database: all migrations, concurrent runner, repeat and safe baseline revert', async () =>
  isolated(async (db) => {
    const completed = await Promise.all([
      migrateDatabase(db),
      migrateDatabase(db),
    ]);
    assert.equal(completed.flat().length, migrations.length);
    assert.deepEqual(await migrateDatabase(db), []);
    assert.equal(
      (await db.query('SELECT * FROM typeorm_migrations')).length,
      migrations.length,
    );
    await migrateDatabase(db, { revert: true });
    await migrateDatabase(db, { revert: true });
    await assert.rejects(
      () => migrateDatabase(db, { revert: true }),
      /Destructive rollback disabled/,
    );
    assert.equal(
      (await db.query('SELECT * FROM typeorm_migrations')).length,
      migrations.length - 2,
    );
    assert.equal((await migrateDatabase(db)).length, 2);
  }));

test('L2 lesson schema enforces uniqueness, cascades chapters and rolls back cleanly', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({
        title: 'Lesson schema course',
        slug: 'lesson-schema-course',
      }),
    );
    const chapter = await db.getRepository(Chapter).save(
      db.getRepository(Chapter).create({
        courseId: course.id,
        title: 'Lesson schema chapter',
        position: 0,
      }),
    );
    const lessons = db.getRepository(Lesson);
    const lesson = await lessons.save(
      lessons.create({
        courseId: course.id,
        chapterId: chapter.id,
        title: 'Introduction',
        slug: 'introduction',
        type: LessonType.TEXT,
        position: 0,
        textBody: '# Introduction',
      }),
    );
    assert.equal(lesson.isPreview, false);
    assert.equal(lesson.isPublished, true);
    await rejectsCode(
      () =>
        lessons.insert({
          courseId: course.id,
          chapterId: chapter.id,
          title: 'Duplicate position',
          slug: 'duplicate-position',
          type: LessonType.TEXT,
          position: 0,
          textBody: 'Body',
        }),
      '23505',
      'UQ_lessons_chapter_position',
    );
    await db.getRepository(Chapter).delete(chapter.id);
    assert.equal(await lessons.countBy({ chapterId: chapter.id }), 0);

    await migrateDatabase(db, { revert: true });
    assert.equal(
      (await db.query('SELECT to_regtype(\'"LessonType"\') AS name'))[0].name,
      null,
    );
    assert.notEqual(
      (await db.query("SELECT to_regclass('lessons') AS name"))[0].name,
      null,
    );
  }));

test('C15 free enrollment is race-safe and lesson access honors previews', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: 'c15@example.invalid',
        displayName: 'C15 Student',
      }),
    );
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({
        title: 'C15 Course',
        slug: 'c15-course',
        status: CourseStatus.PUBLISHED,
        price: 0,
      }),
    );
    const [chapter] = await db.query(
      'INSERT INTO chapters(course_id,title,position) VALUES ($1,$2,0) RETURNING id',
      [course.id, 'C15 Chapter'],
    );
    const [preview] = await db.query(
      'INSERT INTO lessons(course_id,chapter_id,title,slug,type,text_body,position,is_preview) VALUES ($1,$2,$3,$4,$5,$6,0,true) RETURNING id',
      [course.id, chapter.id, 'Preview', 'preview', 'TEXT', 'Preview content'],
    );
    const [protectedLesson] = await db.query(
      'INSERT INTO lessons(course_id,chapter_id,title,slug,type,text_body,position,is_preview) VALUES ($1,$2,$3,$4,$5,$6,1,false) RETURNING id',
      [
        course.id,
        chapter.id,
        'Protected',
        'protected',
        'TEXT',
        'Protected content',
      ],
    );
    const access = new CourseAccessService({ dataSource: db });
    assert.deepEqual(await access.canAccessLesson(undefined, preview.id), {
      granted: true,
    });
    assert.deepEqual(
      await access.canAccessLesson(undefined, protectedLesson.id),
      { granted: false, reason: 'AUTHENTICATION_REQUIRED' },
    );
    assert.deepEqual(
      await access.canAccessLesson(user.id, protectedLesson.id),
      { granted: false, reason: 'ENROLLMENT_REQUIRED' },
    );

    const enrollments = new CoursesService({ dataSource: db }, {});
    assert.deepEqual(await enrollments.enrollmentStatus(user.id, course.id), {
      isEnrolled: false,
    });
    const results = await Promise.allSettled([
      enrollments.enroll(user.id, course.id),
      enrollments.enroll(user.id, course.id),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.getStatus(), 409);
    assert.equal(
      await db.getRepository(Enrollment).countBy({
        userId: user.id,
        courseId: course.id,
      }),
      1,
    );
    assert.equal(
      (await enrollments.enrollmentStatus(user.id, course.id)).isEnrolled,
      true,
    );
    assert.deepEqual(
      await access.canAccessLesson(user.id, protectedLesson.id),
      {
        granted: true,
      },
    );
  }));

test('P2 lesson progress schema: indexes, unique relation, cascades and Down/Up', async () =>
  isolated(async (db, schema) => {
    await migrateDatabase(db);
    const users = db.getRepository(User);
    const courses = db.getRepository(Course);
    const chapters = db.getRepository(Chapter);
    const lessons = db.getRepository(Lesson);
    const progress = db.getRepository(LessonProgress);
    const user = await users.save(
      users.create({
        email: 'progress@example.invalid',
        displayName: 'Progress Student',
      }),
    );
    const course = await courses.save(
      courses.create({ title: 'Progress Course', slug: 'progress-course' }),
    );
    const chapter = await chapters.save(
      chapters.create({
        courseId: course.id,
        title: 'Progress Chapter',
        position: 0,
      }),
    );
    const lesson = await lessons.save(
      lessons.create({
        courseId: course.id,
        chapterId: chapter.id,
        title: 'Progress Lesson',
        slug: 'progress-lesson',
        type: LessonType.TEXT,
        position: 0,
        textBody: 'Body',
      }),
    );
    const row = await progress.save(
      progress.create({
        userId: user.id,
        lessonId: lesson.id,
        courseId: course.id,
      }),
    );
    assert.equal(row.status, LessonProgressStatus.IN_PROGRESS);
    assert.ok(row.startedAt instanceof Date);
    assert.ok(row.lastAccessedAt instanceof Date);
    assert.ok(row.createdAt instanceof Date);
    assert.ok(row.updatedAt instanceof Date);
    const loaded = await progress.findOneOrFail({
      where: { id: row.id },
      relations: { user: true, lesson: true, course: true },
    });
    assert.equal(loaded.user.id, user.id);
    assert.equal(loaded.lesson.id, lesson.id);
    assert.equal(loaded.course.id, course.id);
    await rejectsCode(
      () =>
        progress.insert({
          userId: user.id,
          lessonId: lesson.id,
          courseId: course.id,
        }),
      '23505',
      'UQ_lesson_progress_user_lesson',
    );
    const indexes = await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='lesson_progress'",
      [schema],
    );
    for (const name of [
      'idx_lesson_progress_user_course',
      'idx_lesson_progress_user_lesson',
      'idx_lesson_progress_completed',
    ])
      assert.ok(indexes.some((index) => index.indexname === name));

    await users.delete(user.id);
    assert.equal(await progress.countBy({ id: row.id }), 0);
    const secondUser = await users.save(
      users.create({
        email: 'progress2@example.invalid',
        displayName: 'Second Student',
      }),
    );
    const second = await progress.save(
      progress.create({
        userId: secondUser.id,
        lessonId: lesson.id,
        courseId: course.id,
      }),
    );
    await lessons.delete(lesson.id);
    assert.equal(await progress.countBy({ id: second.id }), 0);

    await migrateDatabase(db, { revert: true });
    assert.equal(
      (
        await db.query('SELECT to_regtype(\'"LessonProgressStatus"\') AS name')
      )[0].name,
      null,
    );
    const legacyColumns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='lesson_progress'",
      [schema],
    );
    assert.ok(
      legacyColumns.some((column) => column.column_name === 'enrollment_id'),
    );
    assert.equal((await migrateDatabase(db)).length, 1);
  }));

test('P3 progress API service: concurrent idempotency, enrollment and aggregation', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p3@example.invalid', displayName: 'P3 Student' }),
    );
    const outsider = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p3-outsider@example.invalid', displayName: 'P3 Outsider' }),
    );
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({ title: 'P3 Course', slug: 'p3-course' }),
    );
    const chapter = await db.getRepository(Chapter).save(
      db.getRepository(Chapter).create({ courseId: course.id, title: 'P3 Chapter', position: 0 }),
    );
    const lessons = [];
    for (let position = 0; position < 6; position += 1) {
      lessons.push(await db.getRepository(Lesson).save(
        db.getRepository(Lesson).create({
          courseId: course.id, chapterId: chapter.id, title: `Lesson ${position + 1}`,
          slug: `lesson-${position + 1}`, type: LessonType.TEXT, position, textBody: 'Body',
        }),
      ));
    }
    await db.getRepository(Enrollment).save(
      db.getRepository(Enrollment).create({ userId: user.id, courseId: course.id }),
    );
    const engine = new CourseProgressEngine({ dataSource: db });
    const service = new ProgressService({ dataSource: db }, engine);
    await assert.rejects(
      () => service.startLesson(outsider.id, lessons[0].id),
      (error) => error.getStatus() === 403,
    );
    await Promise.all(Array.from({ length: 5 }, () =>
      service.completeLesson(user.id, lessons[0].id, { scrollPercentage: 80 }),
    ));
    assert.equal(await db.getRepository(LessonProgress).countBy({
      userId: user.id, lessonId: lessons[0].id,
    }), 1);
    const firstCompletedAt = (await db.getRepository(LessonProgress).findOneByOrFail({
      userId: user.id, lessonId: lessons[0].id,
    })).completedAt.toISOString();
    await service.completeLesson(user.id, lessons[0].id, { scrollPercentage: 80 });
    assert.equal((await db.getRepository(LessonProgress).findOneByOrFail({
      userId: user.id, lessonId: lessons[0].id,
    })).completedAt.toISOString(), firstCompletedAt);
    await service.completeLesson(user.id, lessons[1].id, { scrollPercentage: 80 });
    const result = await service.completeLesson(user.id, lessons[2].id, { scrollPercentage: 80 });
    assert.equal(result.courseProgress.courseId, course.id);
    assert.equal(result.courseProgress.completedRequiredLessons, 3);
    assert.equal(result.courseProgress.totalRequiredLessons, 6);
    assert.equal(result.courseProgress.percentage, 50);
  }));

test('P4 required lessons: defaults, optional exclusion and live toggle aggregation', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p4@example.invalid', displayName: 'P4 Student' }),
    );
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({ title: 'P4 Course', slug: 'p4-course' }),
    );
    const chapter = await db.getRepository(Chapter).save(
      db.getRepository(Chapter).create({ courseId: course.id, title: 'P4 Chapter', position: 0 }),
    );
    const definitions = [true, true, false, true];
    const lessons = [];
    for (const [position, isRequired] of definitions.entries()) {
      lessons.push(await db.getRepository(Lesson).save(
        db.getRepository(Lesson).create({
          courseId: course.id, chapterId: chapter.id, title: `P4 Lesson ${position + 1}`,
          slug: `p4-lesson-${position + 1}`, type: LessonType.TEXT, position, textBody: 'Body', isRequired,
        }),
      ));
    }
    const [defaulted] = await db.query(
      `INSERT INTO lessons(course_id,chapter_id,title,slug,type,position,text_body)
       VALUES ($1,$2,'Default required','default-required','TEXT',4,'Body') RETURNING is_required`,
      [course.id, chapter.id],
    );
    assert.equal(defaulted.is_required, true);
    await db.getRepository(Lesson).delete({ chapterId: chapter.id, position: 4 });
    await db.getRepository(Enrollment).save(
      db.getRepository(Enrollment).create({ userId: user.id, courseId: course.id }),
    );
    const engine = new CourseProgressEngine({ dataSource: db });
    const service = new ProgressService({ dataSource: db }, engine);
    const complete = (index) =>
      service.completeLesson(user.id, lessons[index].id, { scrollPercentage: 80 });
    assert.equal((await complete(0)).courseProgress.percentage, 33);
    await db.getRepository(Lesson).update(lessons[3].id, { isRequired: false });
    const toggled = await service.calculateCourseProgress(user.id, course.id);
    assert.equal(toggled.completedRequiredLessons, 1);
    assert.equal(toggled.totalRequiredLessons, 2);
    assert.equal(toggled.percentage, 50);
    await db.getRepository(Lesson).update(lessons[3].id, { isRequired: true });
    assert.equal((await service.calculateCourseProgress(user.id, course.id)).percentage, 33);
    assert.equal((await complete(2)).courseProgress.percentage, 33);
    assert.equal((await complete(1)).courseProgress.percentage, 67);
    assert.equal((await complete(3)).courseProgress.percentage, 100);
    await migrateDatabase(db, { revert: true });
    const removed = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='lessons' AND column_name='is_required'",
    );
    assert.equal(removed.length, 0);
    assert.equal((await migrateDatabase(db)).length, 1);
    assert.ok((await db.query('SELECT is_required FROM lessons')).every((row) => row.is_required === true));
  }));

test('P5 progress SSOT: detail, enrolled list and completion share one summary', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p5@example.invalid', displayName: 'P5 Student' }),
    );
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({ title: 'P5 Course', slug: 'p5-course' }),
    );
    const chapter = await db.getRepository(Chapter).save(
      db.getRepository(Chapter).create({ courseId: course.id, title: 'P5 Chapter', position: 0 }),
    );
    const lessons = [];
    for (const [position, isRequired] of [true, true, true, false, false].entries()) {
      lessons.push(await db.getRepository(Lesson).save(
        db.getRepository(Lesson).create({
          courseId: course.id,
          chapterId: chapter.id,
          title: `P5 Lesson ${position + 1}`,
          slug: `p5-lesson-${position + 1}`,
          type: LessonType.TEXT,
          position,
          textBody: 'Body',
          isRequired,
        }),
      ));
    }
    await db.getRepository(Enrollment).save(
      db.getRepository(Enrollment).create({ userId: user.id, courseId: course.id }),
    );
    const engine = new CourseProgressEngine({ dataSource: db });
    const service = new ProgressService({ dataSource: db }, engine);
    await service.completeLesson(user.id, lessons[0].id, { scrollPercentage: 80 });
    await service.completeLesson(user.id, lessons[1].id, { scrollPercentage: 80 });
    const completed = await service.completeLesson(user.id, lessons[3].id, { scrollPercentage: 80 });
    await db.query(
      `UPDATE lesson_progress SET last_accessed_at = CURRENT_TIMESTAMP + INTERVAL '1 minute'
       WHERE user_id = $1 AND lesson_id = $2`,
      [user.id, lessons[3].id],
    );

    const detail = await service.courseProgress(user.id, course.id);
    const [enrolled] = await engine.enrolledCourses(user.id);
    for (const summary of [completed.courseProgress, detail, enrolled.progress]) {
      assert.equal(summary.percentage, 67);
      assert.equal(summary.completedLessons, 3);
      assert.equal(summary.completedRequiredLessons, 2);
      assert.equal(summary.totalRequiredLessons, 3);
      assert.equal(summary.totalLessons, 5);
    }
    assert.equal(detail.lastAccessedLessonId, lessons[3].id);
    assert.equal(enrolled.progress.lastAccessedLessonId, lessons[3].id);
    assert.equal(enrolled.lastAccessedLessonSlug, lessons[3].slug);
  }));

test('P6 resume learning: persists server state, seeks cross-device and falls back safely', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p6@example.invalid', displayName: 'P6 Student' }),
    );
    const newcomer = await db.getRepository(User).save(
      db.getRepository(User).create({ email: 'p6-new@example.invalid', displayName: 'P6 New' }),
    );
    const course = await db.getRepository(Course).save(
      db.getRepository(Course).create({ title: 'P6 Course', slug: 'p6-course' }),
    );
    const chapter = await db.getRepository(Chapter).save(
      db.getRepository(Chapter).create({ courseId: course.id, title: 'P6 Chapter', position: 0 }),
    );
    const lessons = [];
    for (let position = 0; position < 3; position += 1) {
      lessons.push(await db.getRepository(Lesson).save(
        db.getRepository(Lesson).create({
          courseId: course.id, chapterId: chapter.id, title: `P6 Lesson ${position + 1}`,
          slug: `p6-lesson-${position + 1}`, type: LessonType.TEXT, position, textBody: 'Body',
        }),
      ));
    }
    await db.getRepository(Enrollment).save([
      db.getRepository(Enrollment).create({ userId: user.id, courseId: course.id }),
      db.getRepository(Enrollment).create({ userId: newcomer.id, courseId: course.id }),
    ]);
    const engine = new CourseProgressEngine({ dataSource: db });
    const progress = new ProgressService({ dataSource: db }, engine);
    const resume = new ResumeLearningService({ dataSource: db }, engine);
    await progress.startLesson(user.id, lessons[1].id);
    await progress.updateHeartbeat(user.id, lessons[1].id, { lastPosition: 90 });

    const persisted = await db.getRepository(Enrollment).findOneByOrFail({
      userId: user.id, courseId: course.id,
    });
    assert.equal(persisted.lastAccessedLessonId, lessons[1].id);
    assert.ok(persisted.lastAccessedAt instanceof Date);
    assert.deepEqual(await resume.course(user.id, course.id), {
      lessonSlug: lessons[1].slug,
      lessonTitle: lessons[1].title,
      lastPosition: 90,
      hasStarted: true,
    });
    assert.equal((await resume.latest(user.id)).resumeLesson.lastPosition, 90);

    assert.deepEqual(await resume.course(newcomer.id, course.id), {
      lessonSlug: lessons[0].slug,
      lessonTitle: lessons[0].title,
      lastPosition: 0,
      hasStarted: false,
    });
    await db.getRepository(Lesson).update(lessons[1].id, { isPublished: false });
    assert.equal((await resume.course(user.id, course.id)).lessonSlug, lessons[0].slug);

    const indexes = await db.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'idx_enrollments_user_last_accessed'`,
    );
    assert.equal(indexes.length, 1);
  }));

test('C4 enrollment schema: preserves legacy rows, relations, constraints, cascades and Down/Up', async () =>
  isolated(async (db, schema) => {
    await legacy(db, 7);
    const [user] = await db.query(
      "INSERT INTO users(email,display_name) VALUES ('c4@example.invalid','C4 User') RETURNING id",
    );
    const [course] = await db.query(
      "INSERT INTO courses(title,slug) VALUES ('C4 Course','c4-course') RETURNING id",
    );
    const [existing] = await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2) RETURNING id',
      [user.id, course.id],
    );
    assert.equal((await migrateDatabase(db, { adoptLegacy: true })).length, 2);

    const preserved = await db.query(
      'SELECT id,user_id,course_id,revoked_at FROM enrollments WHERE id=$1',
      [existing.id],
    );
    assert.deepEqual(preserved[0], {
      id: existing.id,
      user_id: user.id,
      course_id: course.id,
      revoked_at: null,
    });
    const columns = await db.query(
      "SELECT * FROM information_schema.columns WHERE table_schema=$1 AND table_name='enrollments'",
      [schema],
    );
    assert.ok(columns.some((column) => column.column_name === 'revoked_at'));
    assert.equal(
      columns
        .find((column) => column.column_name === 'id')
        .column_default.includes('uuid_generate_v4'),
      true,
    );
    assert.equal(
      columns.find((column) => column.column_name === 'enrolled_at')
        .is_nullable,
      'NO',
    );

    const indexes = await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='enrollments'",
      [schema],
    );
    assert.ok(
      indexes.some((index) => index.indexname === 'enrollments_user_idx'),
    );
    assert.ok(
      indexes.some((index) => index.indexname === 'enrollments_course_idx'),
    );
    assert.ok(
      indexes.some(
        (index) => index.indexname === 'enrollments_user_id_course_id_key',
      ),
    );
    const foreignKeys = await db.query(
      "SELECT conname,confdeltype FROM pg_constraint WHERE conrelid='enrollments'::regclass AND contype='f' ORDER BY conname",
    );
    assert.deepEqual(
      foreignKeys.map((key) => [key.conname, key.confdeltype]),
      [
        ['FK_enrollments_course', 'c'],
        ['FK_enrollments_user', 'c'],
      ],
    );

    const users = db.getRepository(User);
    const courses = db.getRepository(Course);
    const enrollments = db.getRepository(Enrollment);
    const loaded = await enrollments.findOneOrFail({
      where: { id: existing.id },
      relations: { user: true, course: true },
    });
    assert.equal(loaded.user.id, user.id);
    assert.equal(loaded.course.id, course.id);
    assert.ok(loaded.enrolledAt instanceof Date);
    const userWithEnrollments = await users.findOneOrFail({
      where: { id: user.id },
      relations: { enrollments: true },
    });
    const courseWithEnrollments = await courses.findOneOrFail({
      where: { id: course.id },
      relations: { enrollments: true },
    });
    assert.equal(userWithEnrollments.enrollments[0].id, existing.id);
    assert.equal(courseWithEnrollments.enrollments[0].id, existing.id);
    await rejectsCode(
      () => enrollments.insert({ userId: user.id, courseId: course.id }),
      '23505',
      'enrollments_user_id_course_id_key',
    );

    await courses.delete(course.id);
    assert.equal(await enrollments.countBy({ userId: user.id }), 0);
    const anotherCourse = await courses.save(
      courses.create({ title: 'Cascade course', slug: 'cascade-course' }),
    );
    await enrollments.save(
      enrollments.create({ userId: user.id, courseId: anotherCourse.id }),
    );
    await users.delete(user.id);
    assert.equal(await enrollments.count(), 0);

    await migrateDatabase(db, { revert: true });
    const revertedKeys = await db.query(
      "SELECT conname,confdeltype FROM pg_constraint WHERE conrelid='enrollments'::regclass AND contype='f' ORDER BY conname",
    );
    assert.deepEqual(
      revertedKeys.map((key) => [key.conname, key.confdeltype]),
      [
        ['enrollments_course_id_fkey', 'r'],
        ['enrollments_user_id_fkey', 'r'],
      ],
    );
    assert.equal(
      (await db.query("SELECT to_regclass('enrollments_user_idx') AS name"))[0]
        .name,
      null,
    );
    assert.equal((await migrateDatabase(db)).length, 1);
    const reappliedKeys = await db.query(
      "SELECT confdeltype FROM pg_constraint WHERE conrelid='enrollments'::regclass AND contype='f'",
    );
    assert.ok(reappliedKeys.every((key) => key.confdeltype === 'c'));
  }));

test('C3 chapters schema: constraints, indexes, relation, cascade and Down/Up', async () =>
  isolated(async (db, schema) => {
    await migrateDatabase(db);
    const columns = await db.query(
      "SELECT * FROM information_schema.columns WHERE table_schema=$1 AND table_name='chapters'",
      [schema],
    );
    const column = (name) =>
      columns.find((entry) => entry.column_name === name);
    assert.equal(
      column('id').column_default.includes('uuid_generate_v4'),
      true,
    );
    assert.equal(column('course_id').is_nullable, 'NO');
    assert.equal(column('title').character_maximum_length, 255);
    assert.equal(column('description').is_nullable, 'YES');
    assert.equal(column('position').is_nullable, 'NO');
    assert.equal(column('created_at').data_type, 'timestamp with time zone');
    assert.equal(column('updated_at').data_type, 'timestamp with time zone');

    const indexes = await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='chapters'",
      [schema],
    );
    assert.ok(
      indexes.some((index) => index.indexname === 'chapters_course_id_idx'),
    );
    assert.ok(
      indexes.some(
        (index) => index.indexname === 'chapters_course_position_idx',
      ),
    );
    const foreignKey = await db.query(
      "SELECT confdeltype FROM pg_constraint WHERE conrelid='chapters'::regclass AND conname='FK_chapters_course'",
    );
    assert.equal(foreignKey[0].confdeltype, 'c');

    const courses = db.getRepository(Course);
    const course = await courses.save(
      courses.create({ title: 'Chapter course', slug: 'chapter-course' }),
    );
    const chapters = db.getRepository(Chapter);
    const chapter = await chapters.save(
      chapters.create({
        courseId: course.id,
        title: 'First chapter',
        position: 0,
      }),
    );
    const loaded = await courses.findOneOrFail({
      where: { id: course.id },
      relations: { chapters: true },
    });
    assert.equal(loaded.chapters[0].id, chapter.id);
    assert.ok(loaded.chapters[0].createdAt instanceof Date);
    await rejectsCode(
      () =>
        chapters.insert({
          courseId: course.id,
          title: 'Invalid',
          position: -1,
        }),
      '23514',
      'chapters_position_check',
    );
    await rejectsCode(
      () =>
        chapters.insert({
          courseId: randomUUID(),
          title: 'Orphan',
          position: 0,
        }),
      '23503',
      'FK_chapters_course',
    );
    await courses.delete(course.id);
    assert.equal(await chapters.count(), 0);

    await migrateDatabase(db, { revert: true });
    await migrateDatabase(db, { revert: true });
    assert.equal(
      (await db.query("SELECT to_regclass('chapters') AS name"))[0].name,
      null,
    );
    assert.equal((await migrateDatabase(db)).length, 2);
  }));

test('legacy adoption: explicit, contiguous, unlocked history required; rejected adoption is atomic', async () =>
  isolated(async (db) => {
    await legacy(db);
    await assert.rejects(() => migrateDatabase(db), /db:adopt-legacy/);
    await db.query('UPDATE knex_migrations_lock SET is_locked=1');
    await assert.rejects(
      () => migrateDatabase(db, { adoptLegacy: true }),
      /locked/,
    );
    await db.query('UPDATE knex_migrations_lock SET is_locked=0');
    await db.query("UPDATE knex_migrations SET name='unknown.mjs' WHERE id=2");
    await assert.rejects(
      () => migrateDatabase(db, { adoptLegacy: true }),
      /Unknown or non-contiguous/,
    );
    assert.equal(
      (await db.query("SELECT to_regclass('typeorm_migrations') AS name"))[0]
        .name,
      null,
    );
    await db.query('UPDATE knex_migrations SET name=$1 WHERE id=2', [
      migrationHistory[1].legacy,
    ]);
    await db.query(
      'ALTER TABLE users RENAME COLUMN avatar_key TO missing_avatar_key',
    );
    await assert.rejects(
      () => migrateDatabase(db, { adoptLegacy: true }),
      /avatar_key/,
    );
    assert.equal(
      (await db.query("SELECT to_regclass('typeorm_migrations') AS name"))[0]
        .name,
      null,
    );
    await db.query(
      'ALTER TABLE users RENAME COLUMN missing_avatar_key TO avatar_key',
    );
    assert.equal((await migrateDatabase(db, { adoptLegacy: true })).length, 3);
    assert.deepEqual(await migrateDatabase(db), []);
  }));

test('C2 legacy upgrade: data/constraints, real repositories, Down/Up', async () =>
  isolated(async (db, schema) => {
    await legacy(db);
    const [user] = await db.query(
      "INSERT INTO users(email,display_name,password_hash) VALUES ('c2@example.invalid','Instructor','private-hash') RETURNING *",
    );
    await db.query(
      "INSERT INTO user_roles(user_id,role_code) VALUES ($1,'student')",
      [user.id],
    );
    await db.query(
      "INSERT INTO auth_sessions(user_id,refresh_hash,expires_at) VALUES ($1,'existing-refresh-hash',now()+interval '1 day')",
      [user.id],
    );
    await db.query(
      "INSERT INTO auth_identities(user_id,provider,provider_subject) VALUES ($1,'google','existing-subject')",
      [user.id],
    );
    const authSnapshot = async () =>
      Promise.all(
        ['users', 'user_roles', 'auth_sessions', 'auth_identities'].map(
          (table) => db.query(`SELECT * FROM ${table}`),
        ),
      );
    const authBefore = await authSnapshot();
    const statuses = Object.values(CourseStatus);
    const existing = [];
    for (const status of statuses) {
      existing.push(
        (
          await db.query(
            "INSERT INTO courses(title,slug,status,owner_id,created_at) VALUES ($1,$1,$1,$2,'2025-01-01T00:00:00Z') RETURNING *",
            [status, user.id],
          )
        )[0],
      );
    }
    await db.query(
      "INSERT INTO course_sections(course_id,title,position) VALUES ($1,'Existing section',0)",
      [existing[0].id],
    );
    await db.query(
      'INSERT INTO course_instructors(course_id,user_id) VALUES ($1,$2)',
      [existing[0].id, user.id],
    );
    await migrateDatabase(db, { adoptLegacy: true });
    assert.deepEqual(await authSnapshot(), authBefore);
    const rows = await db.query('SELECT * FROM courses ORDER BY slug');
    assert.deepEqual(
      rows.map((row) => row.status),
      [...statuses].sort(),
    );
    for (const row of rows) {
      assert.equal(row.owner_id, user.id);
      assert.equal(row.instructor_id, null);
      assert.equal(row.published_at, null);
      assert.equal(row.updated_at.toISOString(), row.created_at.toISOString());
    }
    const columns = await db.query(
      "SELECT * FROM information_schema.columns WHERE table_schema=$1 AND table_name='courses'",
      [schema],
    );
    for (const name of ['published_at', 'created_at', 'updated_at'])
      assert.equal(
        columns.find((c) => c.column_name === name).data_type,
        'timestamp with time zone',
      );
    assert.equal(
      columns.find((c) => c.column_name === 'status').udt_name,
      'CourseStatus',
    );
    const indexes = await db.query(
      "SELECT * FROM pg_indexes WHERE schemaname=$1 AND tablename='courses'",
      [schema],
    );
    assert.ok(indexes.some((i) => /UNIQUE.*\(slug\)/.test(i.indexdef)));
    assert.ok(indexes.some((i) => /\(instructor_id\)/.test(i.indexdef)));
    assert.ok(indexes.some((i) => /\(status, published_at\)/.test(i.indexdef)));
    const instructor = await db
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    assert.equal(instructor.passwordHash, undefined);
    const courses = db.getRepository(Course);
    const created = await courses.save(
      courses.create({ title: 'New', slug: 'new', instructor }),
    );
    const loaded = await courses.findOneOrFail({
      where: { id: created.id },
      relations: { instructor: true },
    });
    assert.equal(loaded.instructor.id, user.id);
    assert.equal(loaded.status, CourseStatus.DRAFT);
    for (const key of [
      'description',
      'shortDescription',
      'thumbnail',
      'publishedAt',
    ])
      assert.equal(loaded[key], null);
    assert.ok(loaded.createdAt instanceof Date);
    await courses.update(created.id, {
      status: CourseStatus.PUBLISHED,
      publishedAt: new Date(),
      shortDescription: 'Short',
      thumbnail: 'course.webp',
    });
    assert.ok(
      (await courses.findOneByOrFail({ id: created.id })).updatedAt >
        loaded.updatedAt,
    );
    await rejectsCode(
      () => courses.insert({ title: 'Duplicate', slug: 'new' }),
      '23505',
    );
    await rejectsCode(
      () => db.query("INSERT INTO courses(slug) VALUES ('no-title')"),
      '23502',
    );
    await rejectsCode(
      () => db.query("INSERT INTO courses(title) VALUES ('No slug')"),
      '23502',
    );
    await rejectsCode(
      () =>
        db.query("UPDATE courses SET status='unknown' WHERE id=$1", [
          created.id,
        ]),
      '22P02',
    );
    await rejectsCode(
      () => courses.update(created.id, { instructorId: randomUUID() }),
      '23503',
      'FK_courses_instructor',
    );
    const [only] = await db.query(
      "INSERT INTO users(email,display_name) VALUES ('only@example.invalid','Only instructor') RETURNING id",
    );
    await courses.update(created.id, { instructorId: only.id });
    await rejectsCode(
      () => db.getRepository(User).delete(only.id),
      '23503',
      'FK_courses_instructor',
    );
    await migrateDatabase(db, { revert: true });
    await migrateDatabase(db, { revert: true });
    await migrateDatabase(db, { revert: true });
    assert.equal(
      (await db.query('SELECT * FROM courses WHERE id=$1', [created.id]))[0]
        .description,
      '',
    );
    assert.equal(
      (await db.query('SELECT * FROM courses')).length,
      statuses.length + 1,
    );
    assert.equal((await db.query('SELECT * FROM course_sections')).length, 1);
    assert.equal(
      (await db.query('SELECT * FROM course_instructors')).length,
      1,
    );
    assert.equal(
      (await db.query('SELECT to_regtype(\'"CourseStatus"\') AS name'))[0].name,
      null,
    );
    await rejectsCode(
      () =>
        db.query("UPDATE courses SET status='unknown' WHERE id=$1", [
          created.id,
        ]),
      '23514',
    );
    assert.equal((await migrateDatabase(db)).length, 3);
  }));

test('already-applied C2 is adopted without replaying SQL', async () =>
  isolated(async (db) => {
    await legacy(db, 7);
    await db.query(
      "INSERT INTO courses(title,slug,short_description) VALUES ('Keep','keep','Preserved')",
    );
    assert.equal((await migrateDatabase(db, { adoptLegacy: true })).length, 2);
    assert.equal(
      (
        await db.query(
          "SELECT short_description FROM courses WHERE slug='keep'",
        )
      )[0].short_description,
      'Preserved',
    );
    await migrateDatabase(db, { revert: true });
    await migrateDatabase(db, { revert: true });
    assert.equal((await migrateDatabase(db)).length, 2);
  }));

test('seeds are idempotent and do not reset an existing administrator password', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const keys = [
      'NODE_ENV',
      'SUPER_ADMIN_EMAIL',
      'SUPER_ADMIN_PASSWORD',
      'SUPER_ADMIN_NAME',
    ];
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    try {
      Object.assign(process.env, {
        NODE_ENV: 'development',
        SUPER_ADMIN_EMAIL: 'admin@example.invalid',
        SUPER_ADMIN_PASSWORD: 'Test-only-password-42',
        SUPER_ADMIN_NAME: 'Test Admin',
      });
      await seedDemo(db);
      await seedAdmin(db);
      const [before] = await db.query(
        "SELECT * FROM users WHERE email='admin@example.invalid'",
      );
      process.env.SUPER_ADMIN_PASSWORD = 'Different-test-password-42';
      await seedDemo(db);
      await seedAdmin(db);
      const [after] = await db.query(
        "SELECT * FROM users WHERE email='admin@example.invalid'",
      );
      assert.equal(after.password_hash, before.password_hash);
      assert.equal((await db.query('SELECT * FROM users')).length, 1);
      assert.equal((await db.query('SELECT * FROM user_roles')).length, 1);
      assert.equal((await db.query('SELECT * FROM courses')).length, 1);
      assert.equal((await db.query('SELECT * FROM lessons')).length, 1);
    } finally {
      for (const key of keys)
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
  }));
