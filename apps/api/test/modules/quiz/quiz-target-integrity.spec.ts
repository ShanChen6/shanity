import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppDataSource } from '../../../src/database/typeorm.js';
import { migrateDatabase } from '../../../src/database/migrate.js';
import {
  QuizEntity,
  QuizScope,
  QuizStatus,
} from '../../../src/modules/quiz/entities/quiz.entity.js';
import {
  QuizAuthorizationGuard,
  type QuizAuthorizationRequest,
} from '../../../src/modules/quiz/guards/quiz-authorization.guard.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from '../../../src/modules/quiz/services/quiz-course-resolver.service.js';
import {
  QuizTargetValidationService,
  rethrowQuizTargetViolation,
} from '../../../src/modules/quiz/services/quiz-target-validation.service.js';
import { User } from '../../../src/users/user.entity.js';

const options = createAppDataSource().options;

if (typeof options.database !== 'string' || !options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

const openSchemas: Array<{
  admin: DataSource;
  db: DataSource;
  schema: string;
}> = [];

afterEach(async () => {
  for (const { admin, db, schema } of openSchemas.splice(0)) {
    if (db.isInitialized) await db.destroy();
    if (admin.isInitialized) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }
});

async function isolated() {
  const schema = `q3_${randomUUID().replaceAll('-', '')}`;
  const admin = await new DataSource(options).initialize();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const db = await new DataSource({
    ...options,
    schema,
    extra: {
      ...options.extra,
      options: `-c timezone=UTC -c search_path=${schema},public`,
    },
  } as DataSourceOptions).initialize();
  openSchemas.push({ admin, db, schema });
  await migrateDatabase(db);
  return db;
}

async function createUser(db: DataSource, label: string) {
  return db.getRepository(User).save(
    db.getRepository(User).create({
      email: `q3-${label}-${randomUUID()}@example.invalid`,
      displayName: `Q3 ${label}`,
    }),
  );
}

/** A course with one chapter holding one published TEXT lesson. */
async function createCourse(db: DataSource, ownerId: string, label: string) {
  const [course] = await db.query(
    `INSERT INTO courses(title, slug, owner_id, instructor_id)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`Course ${label}`, `q3-${label}-${randomUUID()}`, ownerId],
  );
  const [chapter] = await db.query(
    `INSERT INTO chapters(course_id, title, position)
     VALUES ($1, $2, 0) RETURNING id`,
    [course.id, `Chapter ${label}`],
  );
  const [lesson] = await db.query(
    `INSERT INTO lessons(course_id, chapter_id, title, slug, type, position, text_body)
     VALUES ($1, $2, $3, $4, 'TEXT', 0, 'Body') RETURNING id`,
    [course.id, chapter.id, `Lesson ${label}`, `lesson-${label}`],
  );
  return {
    courseId: course.id as string,
    chapterId: chapter.id as string,
    lessonId: lesson.id as string,
  };
}

async function setup() {
  const db = await isolated();
  const owner = await createUser(db, 'owner');
  const otherInstructor = await createUser(db, 'other');
  const a = await createCourse(db, owner.id, 'a');
  const b = await createCourse(db, otherInstructor.id, 'b');
  const resolver = new QuizCourseResolverService(db);
  const validation = new QuizTargetValidationService(resolver);
  const quizzes = db.getRepository(QuizEntity);
  const insertQuiz = (
    scope: QuizScope | string,
    targetId: string | null,
    createdBy = owner.id,
  ) =>
    db.query<Array<{ id: string }>>(
      `INSERT INTO quizzes(title, created_by, scope, target_id)
       VALUES ('Q3', $1, $2, $3) RETURNING id`,
      [createdBy, scope, targetId],
    );
  return {
    db,
    owner,
    otherInstructor,
    a,
    b,
    resolver,
    validation,
    quizzes,
    insertQuiz,
  };
}

async function expectBadRequest(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    statusCode: 400,
    code,
  });
}

const checkViolation = {
  code: '23514',
  constraint: 'CHK_quizzes_scope_target_integrity',
};
const targetViolation = { code: '23503', constraint: 'FK_quizzes_target' };

describe('Q3 quiz target integrity enforcement', () => {
  it('rejects a STANDALONE quiz that carries a target (API and DB)', async () => {
    const { validation, insertQuiz, a } = await setup();

    await expectBadRequest(
      validation.validate(QuizScope.STANDALONE, 'uuid-x'),
      'STANDALONE_QUIZ_CANNOT_HAVE_TARGET',
    );
    await expectBadRequest(
      validation.validate(QuizScope.STANDALONE, a.courseId),
      'STANDALONE_QUIZ_CANNOT_HAVE_TARGET',
    );
    await expect(
      insertQuiz(QuizScope.STANDALONE, a.courseId),
    ).rejects.toMatchObject(checkViolation);
  });

  it('rejects contextual scopes without a target (API and DB)', async () => {
    const { validation, insertQuiz } = await setup();

    for (const [scope, code] of [
      [QuizScope.LESSON, 'INVALID_TARGET_LESSON'],
      [QuizScope.CHAPTER, 'INVALID_TARGET_CHAPTER'],
      [QuizScope.COURSE, 'INVALID_TARGET_COURSE'],
    ] as const) {
      await expectBadRequest(validation.validate(scope, null), code);
      await expectBadRequest(validation.validate(scope, undefined), code);
      await expect(insertQuiz(scope, null)).rejects.toMatchObject(
        checkViolation,
      );
    }
  });

  it('rejects a LESSON quiz pointing at a Chapter id or a missing lesson', async () => {
    const { validation, insertQuiz, a } = await setup();

    for (const targetId of [a.chapterId, a.courseId, randomUUID(), 'uuid-x'])
      await expectBadRequest(
        validation.validate(QuizScope.LESSON, targetId),
        'INVALID_TARGET_LESSON',
      );
    await expect(
      insertQuiz(QuizScope.LESSON, a.chapterId),
    ).rejects.toMatchObject(targetViolation);
    await expect(
      insertQuiz(QuizScope.LESSON, randomUUID()),
    ).rejects.toMatchObject(targetViolation);
  });

  it('rejects CHAPTER/COURSE quizzes bound to the wrong entity type', async () => {
    const { validation, insertQuiz, a } = await setup();

    await expectBadRequest(
      validation.validate(QuizScope.CHAPTER, a.lessonId),
      'INVALID_TARGET_CHAPTER',
    );
    await expectBadRequest(
      validation.validate(QuizScope.COURSE, a.chapterId),
      'INVALID_TARGET_COURSE',
    );
    await expect(
      insertQuiz(QuizScope.CHAPTER, a.lessonId),
    ).rejects.toMatchObject(targetViolation);
    await expect(
      insertQuiz(QuizScope.COURSE, a.chapterId),
    ).rejects.toMatchObject(targetViolation);
  });

  it('rejects an unknown scope', async () => {
    const { validation, a } = await setup();
    await expectBadRequest(
      validation.validate('ORGANIZATION', a.courseId),
      'INVALID_QUIZ_SCOPE',
    );
  });

  it('creates one valid quiz for each of the four scopes', async () => {
    const { db, validation, owner, a } = await setup();
    const cases = [
      { scope: QuizScope.LESSON, targetId: a.lessonId, courseId: a.courseId },
      { scope: QuizScope.CHAPTER, targetId: a.chapterId, courseId: a.courseId },
      { scope: QuizScope.COURSE, targetId: a.courseId, courseId: a.courseId },
      { scope: QuizScope.STANDALONE, targetId: null, courseId: null },
    ];

    const saved = await db.transaction(async (manager) => {
      const rows: QuizEntity[] = [];
      for (const { scope, targetId, courseId } of cases) {
        const target = await validation.validate(scope, targetId, manager);
        expect(target).toEqual({ scope, targetId, courseId });
        rows.push(
          await manager.getRepository(QuizEntity).save(
            manager.getRepository(QuizEntity).create({
              title: `Valid ${scope}`,
              scope: target.scope,
              targetId: target.targetId,
              createdBy: owner.id,
            }),
          ),
        );
      }
      return rows;
    });

    const persisted = await db
      .getRepository(QuizEntity)
      .find({ select: { scope: true, targetId: true } });
    expect(
      persisted.map(({ scope, targetId }) => ({ scope, targetId })),
    ).toEqual(
      expect.arrayContaining(
        cases.map(({ scope, targetId }) => ({ scope, targetId })),
      ),
    );
    expect(saved).toHaveLength(4);
  });

  it('rejects updates that make scope and target inconsistent', async () => {
    const { db, insertQuiz, a } = await setup();
    const [quiz] = await insertQuiz(QuizScope.LESSON, a.lessonId);
    const rebind = (scope: string, targetId: string | null) =>
      db.query('UPDATE quizzes SET scope=$2, target_id=$3 WHERE id=$1', [
        quiz.id,
        scope,
        targetId,
      ]);

    await expect(rebind('LESSON', a.chapterId)).rejects.toMatchObject(
      targetViolation,
    );
    await expect(rebind('CHAPTER', a.lessonId)).rejects.toMatchObject(
      targetViolation,
    );
    await expect(rebind('STANDALONE', a.lessonId)).rejects.toMatchObject(
      checkViolation,
    );
    await expect(rebind('CHAPTER', a.chapterId)).resolves.toBeDefined();
    await expect(rebind('STANDALONE', null)).resolves.toBeDefined();
  });

  it('checks the binding at commit, so a target may be created later in the same transaction', async () => {
    const { db, owner, a } = await setup();
    const lessonId = randomUUID();

    await db.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO quizzes(title, created_by, scope, target_id)
         VALUES ('Deferred', $1, 'LESSON', $2)`,
        [owner.id, lessonId],
      );
      await manager.query(
        `INSERT INTO lessons(id, course_id, chapter_id, title, slug, type, position, text_body)
         VALUES ($1, $2, $3, 'Later', 'later', 'TEXT', 1, 'Body')`,
        [lessonId, a.courseId, a.chapterId],
      );
    });
    expect(
      await db.getRepository(QuizEntity).countBy({ targetId: lessonId }),
    ).toBe(1);
  });

  it('restricts deleting a target bound to a non-archived quiz, cascades included', async () => {
    const { db, insertQuiz, a, b } = await setup();
    const [lessonQuiz] = await insertQuiz(QuizScope.LESSON, a.lessonId);
    await insertQuiz(QuizScope.COURSE, b.courseId);

    await expect(
      db.query('DELETE FROM lessons WHERE id=$1', [a.lessonId]),
    ).rejects.toMatchObject(targetViolation);
    // The chapter is unbound, but its ON DELETE CASCADE reaches the lesson.
    await expect(
      db.query('DELETE FROM chapters WHERE id=$1', [a.chapterId]),
    ).rejects.toMatchObject(targetViolation);
    await expect(
      db.query('DELETE FROM courses WHERE id=$1', [b.courseId]),
    ).rejects.toMatchObject(targetViolation);

    await db.query(`UPDATE quizzes SET status='ARCHIVED' WHERE id=$1`, [
      lessonQuiz.id,
    ]);
    await expect(
      db.query('DELETE FROM lessons WHERE id=$1', [a.lessonId]),
    ).resolves.toBeDefined();
  });

  it('maps a database binding violation to a stable 400', async () => {
    const { insertQuiz, a } = await setup();
    const error = await insertQuiz(QuizScope.LESSON, a.chapterId).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    await expectBadRequest(
      Promise.reject(error).catch(rethrowQuizTargetViolation),
      'INVALID_QUIZ_TARGET',
    );
    const unrelated = new Error('unrelated');
    expect(() => rethrowQuizTargetViolation(unrelated)).toThrow(unrelated);
  });
});

describe('Q3 course ownership resolver', () => {
  it('resolves every scope to its owning course', async () => {
    const { resolver, a, b } = await setup();

    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.LESSON,
        targetId: a.lessonId,
      }),
    ).resolves.toBe(a.courseId);
    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.LESSON,
        targetId: b.lessonId,
      }),
    ).resolves.toBe(b.courseId);
    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.CHAPTER,
        targetId: a.chapterId,
      }),
    ).resolves.toBe(a.courseId);
    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.COURSE,
        targetId: b.courseId,
      }),
    ).resolves.toBe(b.courseId);
    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.STANDALONE,
        targetId: null,
      }),
    ).resolves.toBeNull();
  });

  it('follows a lesson moved to a chapter of another course', async () => {
    const { db, resolver, a, b } = await setup();
    await db.query(
      'UPDATE lessons SET chapter_id=$2, course_id=$3, position=1 WHERE id=$1',
      [a.lessonId, b.chapterId, b.courseId],
    );
    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.LESSON,
        targetId: a.lessonId,
      }),
    ).resolves.toBe(b.courseId);
  });

  it('fails loudly for a dangling target instead of treating it as standalone', async () => {
    const { db, resolver, insertQuiz, a } = await setup();
    const [quiz] = await insertQuiz(QuizScope.LESSON, a.lessonId);
    await db.query(`UPDATE quizzes SET status='ARCHIVED' WHERE id=$1`, [
      quiz.id,
    ]);
    await db.query('DELETE FROM lessons WHERE id=$1', [a.lessonId]);

    await expect(
      resolver.resolveCourseIdByQuiz({
        scope: QuizScope.LESSON,
        targetId: a.lessonId,
      }),
    ).rejects.toBeInstanceOf(QuizTargetNotFoundError);
  });

  it('resolves a lesson target in under 5ms', async () => {
    const { resolver, a } = await setup();
    const quiz = { scope: QuizScope.LESSON, targetId: a.lessonId };
    await resolver.resolveCourseIdByQuiz(quiz); // warm the pool and plan

    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const started = performance.now();
      await resolver.resolveCourseIdByQuiz(quiz);
      samples.push(performance.now() - started);
    }
    samples.sort((x, y) => x - y);
    expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(5);
  });
});

describe('Q3 QuizAuthorizationGuard', () => {
  async function guardSetup() {
    const fixture = await setup();
    const guard = new QuizAuthorizationGuard(fixture.db, fixture.resolver);
    const run = (
      principal: { id: string; roles: string[] },
      quizId: string,
    ) => {
      const request = {
        principal,
        params: { quizId },
      } as unknown as QuizAuthorizationRequest;
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      return { request, result: guard.canActivate(context) };
    };
    return { ...fixture, run };
  }

  it('lets the course owner manage a lesson quiz and attaches the resolved course', async () => {
    const { run, insertQuiz, owner, a } = await guardSetup();
    const [quiz] = await insertQuiz(QuizScope.LESSON, a.lessonId);

    const { request, result } = run(
      { id: owner.id, roles: ['instructor'] },
      quiz.id,
    );
    await expect(result).resolves.toBe(true);
    expect(request.quiz).toMatchObject({
      id: quiz.id,
      scope: QuizScope.LESSON,
      status: QuizStatus.DRAFT,
      courseId: a.courseId,
    });
  });

  it('admits an instructor assigned through course_instructors', async () => {
    const { db, run, insertQuiz, otherInstructor, a } = await guardSetup();
    const [quiz] = await insertQuiz(QuizScope.CHAPTER, a.chapterId);
    await db.query(
      'INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)',
      [a.courseId, otherInstructor.id],
    );
    await expect(
      run({ id: otherInstructor.id, roles: ['instructor'] }, quiz.id).result,
    ).resolves.toBe(true);
  });

  it('denies an instructor of another course and a student owner (IDOR)', async () => {
    const { run, insertQuiz, owner, otherInstructor, a } = await guardSetup();
    const [quiz] = await insertQuiz(QuizScope.COURSE, a.courseId);

    await expect(
      run({ id: otherInstructor.id, roles: ['instructor'] }, quiz.id).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run({ id: owner.id, roles: ['student'] }, quiz.id).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits STANDALONE quizzes to their author and admins', async () => {
    const { run, insertQuiz, owner, otherInstructor } = await guardSetup();
    const [quiz] = await insertQuiz(QuizScope.STANDALONE, null);

    const author = run({ id: owner.id, roles: ['instructor'] }, quiz.id);
    await expect(author.result).resolves.toBe(true);
    expect(author.request.quiz?.courseId).toBeNull();
    await expect(
      run({ id: otherInstructor.id, roles: ['instructor'] }, quiz.id).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run({ id: otherInstructor.id, roles: ['admin'] }, quiz.id).result,
    ).resolves.toBe(true);
  });

  it('hides missing quizzes from non-admins and reports 404 to admins', async () => {
    const { run, owner } = await guardSetup();
    const missing = randomUUID();

    await expect(
      run({ id: owner.id, roles: ['instructor'] }, missing).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run({ id: owner.id, roles: ['instructor'] }, 'not-a-uuid').result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run({ id: owner.id, roles: ['admin'] }, missing).result,
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves a quiz with a dangling target to admins only', async () => {
    const { db, run, insertQuiz, owner, a } = await guardSetup();
    const [quiz] = await insertQuiz(QuizScope.LESSON, a.lessonId);
    await db.query(`UPDATE quizzes SET status='ARCHIVED' WHERE id=$1`, [
      quiz.id,
    ]);
    await db.query('DELETE FROM lessons WHERE id=$1', [a.lessonId]);

    await expect(
      run({ id: owner.id, roles: ['instructor'] }, quiz.id).result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run({ id: owner.id, roles: ['admin'] }, quiz.id).result,
    ).resolves.toBe(true);
  });
});
