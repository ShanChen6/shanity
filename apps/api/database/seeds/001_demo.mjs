export async function seed(db) {
  if (process.env.NODE_ENV === 'production') return;
  await db.transaction(async (trx) => {
    await trx
      .createQueryBuilder()
      .insert()
      .into('courses')
      .values({
        id: '00000000-0000-4000-8000-000000000001',
        slug: 'shanity-demo',
        title: 'Khóa học mẫu Shanity',
      })
      .orIgnore()
      .execute();
    await trx
      .createQueryBuilder()
      .insert()
      .into('course_sections')
      .values({
        id: '00000000-0000-4000-8000-000000000002',
        course_id: '00000000-0000-4000-8000-000000000001',
        title: 'Bắt đầu',
        position: 0,
      })
      .orIgnore()
      .execute();
    await trx
      .createQueryBuilder()
      .insert()
      .into('lessons')
      .values({
        id: '00000000-0000-4000-8000-000000000003',
        course_id: '00000000-0000-4000-8000-000000000001',
        section_id: '00000000-0000-4000-8000-000000000002',
        title: 'Chào mừng',
        body: 'Chào mừng bạn đến với Shanity.',
        position: 0,
      })
      .orIgnore()
      .execute();
  });
}
