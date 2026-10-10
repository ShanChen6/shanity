import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Images authors upload for blog posts (cover and inline). Stored like
 * course_media: normalized WebP in the database, served publicly and
 * immutably at /blog-images/:id. A post refers to them by URL in its
 * Markdown, so there is no foreign key from posts; the uploader is kept
 * for accountability.
 */
export class BlogImages1793059200002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE blog_images (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        uploader_id uuid NOT NULL
          CONSTRAINT "FK_blog_images_uploader" REFERENCES users(id)
          ON DELETE RESTRICT,
        data bytea NOT NULL,
        width integer NOT NULL CHECK (width > 0),
        height integer NOT NULL CHECK (height > 0),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_blog_images_uploader" ON blog_images (uploader_id, created_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE blog_images');
  }
}
