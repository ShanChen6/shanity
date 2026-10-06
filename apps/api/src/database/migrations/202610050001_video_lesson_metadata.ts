import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VideoLessonMetadata1791158400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "VideoProvider" ADD VALUE IF NOT EXISTS 'LOCAL';
      ALTER TYPE "VideoProvider" ADD VALUE IF NOT EXISTS 'EXTERNAL_EMBED';
      ALTER TABLE lessons
        ADD COLUMN video_file_size bigint,
        ADD COLUMN video_mime_type text;
      ALTER TABLE lessons
        ADD CONSTRAINT lessons_video_file_size_check
          CHECK (video_file_size IS NULL OR video_file_size >= 0),
        ADD CONSTRAINT lessons_video_mime_type_check
          CHECK (video_mime_type IS NULL OR video_mime_type IN ('video/mp4', 'video/webm', 'video/quicktime'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lessons
        DROP CONSTRAINT lessons_video_mime_type_check,
        DROP CONSTRAINT lessons_video_file_size_check,
        DROP COLUMN video_mime_type,
        DROP COLUMN video_file_size;
    `);
    // PostgreSQL enum values are intentionally retained on rollback.
  }
}
