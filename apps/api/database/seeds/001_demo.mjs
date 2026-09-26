export async function seed(db) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production');
  await db.transaction(async (trx) => {
    await trx('courses').insert({ id: '00000000-0000-4000-8000-000000000001', slug: 'shanity-demo', title: 'Khóa học mẫu Shanity' }).onConflict('id').ignore();
    await trx('course_sections').insert({ id: '00000000-0000-4000-8000-000000000002', course_id: '00000000-0000-4000-8000-000000000001', title: 'Bắt đầu', position: 0 }).onConflict('id').ignore();
    await trx('lessons').insert({ id: '00000000-0000-4000-8000-000000000003', course_id: '00000000-0000-4000-8000-000000000001', section_id: '00000000-0000-4000-8000-000000000002', title: 'Chào mừng', body: 'Chào mừng bạn đến với Shanity.', position: 0 }).onConflict('id').ignore();
  });
}
