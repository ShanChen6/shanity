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
      .into('chapters')
      .values({
        id: '00000000-0000-4000-8000-000000000002',
        courseId: '00000000-0000-4000-8000-000000000001',
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
        courseId: '00000000-0000-4000-8000-000000000001',
        chapterId: '00000000-0000-4000-8000-000000000002',
        title: 'Chào mừng',
        slug: 'chao-mung',
        type: 'TEXT',
        textBody: 'Chào mừng bạn đến với Shanity.',
        position: 0,
      })
      .orIgnore()
      .execute();
  });
}
