import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import knex from 'knex';
import config from './knexfile.mjs';

const db = knex(config);
const trx = await db.transaction();
async function rejectsCode(query, code) {
  await trx.raw('SAVEPOINT constraint_check');
  try {
    await assert.rejects(query, (error) => error.code === code);
  } finally {
    await trx.raw('ROLLBACK TO SAVEPOINT constraint_check');
    await trx.raw('RELEASE SAVEPOINT constraint_check');
  }
}
try {
  const [user] = await trx('users').insert({ email: `${randomUUID()}@example.invalid`, display_name: 'Constraint test' }).returning('*');
  const [course, other] = await trx('courses').insert([
    { slug: randomUUID(), title: 'Test' }, { slug: randomUUID(), title: 'Other' },
  ]).returning('*');
  assert.deepEqual((await trx('roles').orderBy('code').pluck('code')), ['admin', 'instructor', 'student']);
  await trx('user_roles').insert({ user_id: user.id, role_code: 'instructor' });
  await rejectsCode(() => trx('user_roles').insert({ user_id: user.id, role_code: 'instructor' }), '23505');
  await rejectsCode(() => trx('user_roles').insert({ user_id: user.id, role_code: 'unknown' }), '23503');
  assert.equal(course.owner_id, null);
  await trx('courses').where({ id: course.id }).update({ owner_id: user.id, status: 'review' });
  await rejectsCode(() => trx('courses').where({ id: course.id }).update({ owner_id: randomUUID() }), '23503');
  await trx('course_instructors').insert({ course_id: course.id, user_id: user.id });
  await rejectsCode(() => trx('course_instructors').insert({ course_id: course.id, user_id: user.id }), '23505');
  await rejectsCode(() => trx('course_instructors').insert({ course_id: other.id, user_id: randomUUID() }), '23503');
  await trx('courses').where({ id: course.id }).update({ status: 'hidden' });
  await rejectsCode(() => trx('courses').where({ id: course.id }).update({ status: 'unknown' }), '23514');
  const [section] = await trx('course_sections').insert({ course_id: course.id, title: 'Test', position: 0 }).returning('*');
  const [lesson] = await trx('lessons').insert({ course_id: course.id, section_id: section.id, title: 'Test', position: 0 }).returning('*');
  const [enrollment] = await trx('enrollments').insert({ user_id: user.id, course_id: course.id }).returning('*');
  const [otherEnrollment] = await trx('enrollments').insert({ user_id: user.id, course_id: other.id }).returning('*');
  await rejectsCode(() => trx('enrollments').insert({ user_id: user.id, course_id: course.id }), '23505');
  await rejectsCode(() => trx('users').insert({ email: user.email, display_name: 'Duplicate' }), '23505');
  await rejectsCode(() => trx('lessons').insert({ course_id: other.id, section_id: section.id, title: 'Wrong course', position: 1 }), '23503');
  const progress = { enrollment_id: enrollment.id, lesson_id: lesson.id, course_id: course.id };
  await trx('lesson_progress').insert({ ...progress, watched_seconds: 120, last_position_seconds: 30 });
  assert.equal((await trx('lesson_progress').where(progress).first()).completed_at, null);
  await rejectsCode(() => trx('lesson_progress').insert(progress), '23505');
  await rejectsCode(() => trx('lesson_progress').insert({ ...progress, enrollment_id: otherEnrollment.id }), '23503');
  await rejectsCode(() => trx('lesson_progress').where(progress).update({ watched_seconds: -1 }), '23514');
  await trx('lesson_progress').where(progress).update({ completed_at: new Date(), last_position_seconds: 0 });
  assert.ok((await trx('lesson_progress').where(progress).first()).completed_at);
  await rejectsCode(() => trx('users').where({ id: user.id }).delete(), '23503');
  const [room] = await trx('chat_rooms').insert({ course_id: course.id, name: 'Test' }).returning('*');
  await rejectsCode(() => trx('messages').insert({ room_id: room.id, sender_id: user.id, body: 'Not a member' }), '23503');
  await trx('chat_members').insert({ room_id: room.id, user_id: user.id });
  await trx('messages').insert({ room_id: room.id, sender_id: user.id, body: 'Hello' });
  await rejectsCode(() => trx('posts').insert({ author_id: user.id, slug: randomUUID(), title: 'Test', status: 'published' }), '23514');
  console.log('PASS: roles, ownership, instructor assignment, course statuses, chat membership, blog publication, uniqueness, cross-course foreign keys, nonnegative progress, independent completion, deletion protection');
} finally {
  await trx.rollback();
  await db.destroy();
}
