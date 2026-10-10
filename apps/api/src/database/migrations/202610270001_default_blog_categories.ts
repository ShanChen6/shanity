import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Starter blog topics, so instructors can submit a post (submitting needs a
 * category) without waiting for an admin to create the first one. Admins
 * still own the list: they rename, add or remove topics as before.
 * Existing topics with the same slug are left untouched.
 */
export const DEFAULT_BLOG_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['toan-hoc', 'Toán học'],
  ['vat-ly', 'Vật lý'],
  ['hoa-hoc', 'Hóa học'],
  ['sinh-hoc', 'Sinh học'],
  ['ngu-van', 'Ngữ văn'],
  ['tieng-anh', 'Tiếng Anh'],
  ['lich-su', 'Lịch sử'],
  ['dia-ly', 'Địa lý'],
  ['tin-hoc', 'Tin học'],
  ['ky-nang-hoc-tap', 'Kỹ năng học tập'],
];

export class DefaultBlogCategories1793059200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO categories (slug, name)
       SELECT * FROM unnest($1::text[], $2::text[])
       ON CONFLICT (slug) DO NOTHING`,
      [
        DEFAULT_BLOG_CATEGORIES.map(([slug]) => slug),
        DEFAULT_BLOG_CATEGORIES.map(([, name]) => name),
      ],
    );
  }

  /** Removes the starter topics no post uses yet; used ones stay. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM categories category
       WHERE category.slug = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM posts WHERE posts.category_id = category.id)`,
      [DEFAULT_BLOG_CATEGORIES.map(([slug]) => slug)],
    );
  }
}
