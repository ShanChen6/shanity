import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAppDataSource } from '../dist/database/typeorm.js';

const db = await createAppDataSource().initialize();
const runner = db.createQueryRunner();
await runner.connect();
await runner.startTransaction();
const trx = runner.manager;
async function rejectsCode(query, code) {
  await trx.query('SAVEPOINT constraint_check');
  try {
    await assert.rejects(query, (error) => error.code === code);
  } finally {
    await trx.query('ROLLBACK TO SAVEPOINT constraint_check');
    await trx.query('RELEASE SAVEPOINT constraint_check');
  }
}
try {
  const [user] = await trx.query(
    'INSERT INTO "users" ("email", "display_name") VALUES ($1, $2) RETURNING *',
    [`${randomUUID()}@example.invalid`, 'Constraint test'],
  );
  const [course, other] = await trx.query(
    'INSERT INTO "courses" ("slug", "title") VALUES ($1, $2), ($3, $4) RETURNING *',
    [randomUUID(), 'Test', randomUUID(), 'Other'],
  );
  assert.deepEqual(
    await trx
      .query('SELECT "code" FROM "roles" ORDER BY "code" ASC')
      .then((rows) => rows.map((row) => row.code)),
    ['admin', 'instructor', 'student'],
  );
  await trx.query(
    'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
    [user.id, 'instructor'],
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
        [user.id, 'instructor'],
      ),
    '23505',
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
        [user.id, 'unknown'],
      ),
    '23503',
  );
  assert.equal(course.owner_id, null);
  await trx
    .query(
      'UPDATE "courses" SET "owner_id" = $2, "status" = $3 WHERE "id" = $1',
      [course.id, user.id, 'review'],
    )
    .then(([, count]) => count);
  await rejectsCode(
    () =>
      trx
        .query('UPDATE "courses" SET "owner_id" = $2 WHERE "id" = $1', [
          course.id,
          randomUUID(),
        ])
        .then(([, count]) => count),
    '23503',
  );
  await trx.query(
    'INSERT INTO "course_instructors" ("course_id", "user_id") VALUES ($1, $2)',
    [course.id, user.id],
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "course_instructors" ("course_id", "user_id") VALUES ($1, $2)',
        [course.id, user.id],
      ),
    '23505',
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "course_instructors" ("course_id", "user_id") VALUES ($1, $2)',
        [other.id, randomUUID()],
      ),
    '23503',
  );
  await trx
    .query('UPDATE "courses" SET "status" = $2 WHERE "id" = $1', [
      course.id,
      'hidden',
    ])
    .then(([, count]) => count);
  await rejectsCode(
    () =>
      trx
        .query('UPDATE "courses" SET "status" = $2 WHERE "id" = $1', [
          course.id,
          'unknown',
        ])
        .then(([, count]) => count),
    '22P02',
  );
  const [section] = await trx.query(
    'INSERT INTO "course_sections" ("course_id", "title", "position") VALUES ($1, $2, $3) RETURNING *',
    [course.id, 'Test', 0],
  );
  const [lesson] = await trx.query(
    'INSERT INTO "lessons" ("course_id", "section_id", "title", "position") VALUES ($1, $2, $3, $4) RETURNING *',
    [course.id, section.id, 'Test', 0],
  );
  const [enrollment] = await trx.query(
    'INSERT INTO "enrollments" ("user_id", "course_id") VALUES ($1, $2) RETURNING *',
    [user.id, course.id],
  );
  const [otherEnrollment] = await trx.query(
    'INSERT INTO "enrollments" ("user_id", "course_id") VALUES ($1, $2) RETURNING *',
    [user.id, other.id],
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "enrollments" ("user_id", "course_id") VALUES ($1, $2)',
        [user.id, course.id],
      ),
    '23505',
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "users" ("email", "display_name") VALUES ($1, $2)',
        [user.email, 'Duplicate'],
      ),
    '23505',
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "lessons" ("course_id", "section_id", "title", "position") VALUES ($1, $2, $3, $4)',
        [other.id, section.id, 'Wrong course', 1],
      ),
    '23503',
  );
  const progress = [enrollment.id, lesson.id, course.id];
  await trx.query(
    'INSERT INTO lesson_progress(enrollment_id, lesson_id, course_id, watched_seconds, last_position_seconds) VALUES ($1,$2,$3,120,30)',
    progress,
  );
  const getProgress = () =>
    trx
      .query(
        'SELECT * FROM lesson_progress WHERE enrollment_id=$1 AND lesson_id=$2 AND course_id=$3',
        progress,
      )
      .then((rows) => rows[0]);
  assert.equal((await getProgress()).completed_at, null);
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO lesson_progress(enrollment_id,lesson_id,course_id) VALUES ($1,$2,$3)',
        progress,
      ),
    '23505',
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO lesson_progress(enrollment_id,lesson_id,course_id) VALUES ($1,$2,$3)',
        [otherEnrollment.id, lesson.id, course.id],
      ),
    '23503',
  );
  await rejectsCode(
    () =>
      trx.query(
        'UPDATE lesson_progress SET watched_seconds=-1 WHERE enrollment_id=$1 AND lesson_id=$2 AND course_id=$3',
        progress,
      ),
    '23514',
  );
  await trx.query(
    'UPDATE lesson_progress SET completed_at=now(), last_position_seconds=0 WHERE enrollment_id=$1 AND lesson_id=$2 AND course_id=$3',
    progress,
  );
  assert.ok((await getProgress()).completed_at);
  await rejectsCode(
    () =>
      trx
        .query('DELETE FROM "users" WHERE "id" = $1', [user.id])
        .then(([, count]) => count),
    '23503',
  );
  const [room] = await trx.query(
    'INSERT INTO "chat_rooms" ("course_id", "name") VALUES ($1, $2) RETURNING *',
    [course.id, 'Test'],
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "messages" ("room_id", "sender_id", "body") VALUES ($1, $2, $3)',
        [room.id, user.id, 'Not a member'],
      ),
    '23503',
  );
  await trx.query(
    'INSERT INTO "chat_members" ("room_id", "user_id") VALUES ($1, $2)',
    [room.id, user.id],
  );
  await trx.query(
    'INSERT INTO "messages" ("room_id", "sender_id", "body") VALUES ($1, $2, $3)',
    [room.id, user.id, 'Hello'],
  );
  await rejectsCode(
    () =>
      trx.query(
        'INSERT INTO "posts" ("author_id", "slug", "title", "status") VALUES ($1, $2, $3, $4)',
        [user.id, randomUUID(), 'Test', 'published'],
      ),
    '23514',
  );
  console.log(
    'PASS: roles, ownership, instructor assignment, course statuses, chat membership, blog publication, uniqueness, cross-course foreign keys, nonnegative progress, independent completion, deletion protection',
  );
} finally {
  await runner.rollbackTransaction();
  await runner.release();
  await db.destroy();
}
