import type { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_CHAPTER_NAMESPACE = 'f5f35e17-54ea-4ee2-b8ce-1d25d5fc6107';

export class LessonDomain1790899200007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "LessonType" AS ENUM ('TEXT', 'VIDEO', 'DOCUMENT');
      CREATE TYPE "VideoProvider" AS ENUM ('S3', 'YOUTUBE', 'VIMEO');
      CREATE TYPE "MediaProcessingStatus" AS ENUM ('PROCESSING', 'READY');

      ALTER TABLE lessons DROP CONSTRAINT lessons_parent_check;

      INSERT INTO chapters(id, course_id, title, description, position)
      SELECT uuid_generate_v5('${LEGACY_CHAPTER_NAMESPACE}'::uuid, section.id::text),
             section.course_id,
             section.title,
             NULL,
             base.max_position + row_number() OVER (
               PARTITION BY section.course_id ORDER BY section.position, section.id
             )
      FROM course_sections section
      JOIN (
        SELECT course.id AS course_id,
               COALESCE(MAX(chapter.position), -1) AS max_position
        FROM courses course
        LEFT JOIN chapters chapter ON chapter.course_id = course.id
        GROUP BY course.id
      ) base ON base.course_id = section.course_id
      WHERE EXISTS (SELECT 1 FROM lessons lesson WHERE lesson.section_id = section.id)
        AND NOT EXISTS (
          SELECT 1 FROM chapters chapter
          WHERE chapter.id = uuid_generate_v5('${LEGACY_CHAPTER_NAMESPACE}'::uuid, section.id::text)
        );

      UPDATE lessons lesson
      SET chapter_id = uuid_generate_v5('${LEGACY_CHAPTER_NAMESPACE}'::uuid, lesson.section_id::text)
      WHERE lesson.chapter_id IS NULL AND lesson.section_id IS NOT NULL;

      ALTER TABLE lessons
        ALTER COLUMN id SET DEFAULT uuid_generate_v4(),
        ALTER COLUMN chapter_id SET NOT NULL,
        ALTER COLUMN title TYPE varchar(255),
        ADD COLUMN slug varchar(255),
        ADD COLUMN is_published boolean NOT NULL DEFAULT true,
        ADD COLUMN text_body text,
        ADD COLUMN video_asset_id text,
        ADD COLUMN video_external_url text,
        ADD COLUMN video_provider "VideoProvider",
        ADD COLUMN video_duration_seconds integer,
        ADD COLUMN video_status "MediaProcessingStatus",
        ADD COLUMN document_asset_id text,
        ADD COLUMN document_file_name text,
        ADD COLUMN document_file_size bigint,
        ADD COLUMN document_download_allowed boolean,
        ADD COLUMN updated_at timestamptz;

      UPDATE lessons
      SET slug = left(
            COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')), ''), 'lesson')
            || '-' || replace(id::text, '-', ''),
            255
          ),
          text_body = CASE WHEN type IN ('Article', 'Quiz') THEN body ELSE NULL END,
          video_asset_id = CASE WHEN type = 'Video' THEN NULLIF(btrim(video_storage_key), '') ELSE NULL END,
          video_provider = CASE WHEN type = 'Video' AND NULLIF(btrim(video_storage_key), '') IS NOT NULL THEN 'S3'::"VideoProvider" ELSE NULL END,
          video_duration_seconds = CASE WHEN type = 'Video' THEN duration_seconds ELSE NULL END,
          video_status = CASE WHEN type = 'Video' AND NULLIF(btrim(video_storage_key), '') IS NOT NULL THEN 'READY'::"MediaProcessingStatus" ELSE NULL END,
          is_published = CASE
            WHEN type IN ('Article', 'Quiz') THEN NULLIF(btrim(body), '') IS NOT NULL
            WHEN type = 'Video' THEN NULLIF(btrim(video_storage_key), '') IS NOT NULL
            ELSE false
          END,
          updated_at = created_at;

      ALTER TABLE lessons ALTER COLUMN type DROP DEFAULT;
      ALTER TABLE lessons DROP CONSTRAINT lessons_type_check;
      ALTER TABLE lessons ALTER COLUMN type TYPE "LessonType"
        USING CASE type
          WHEN 'Article' THEN 'TEXT'::"LessonType"
          WHEN 'Quiz' THEN 'TEXT'::"LessonType"
          WHEN 'Video' THEN 'VIDEO'::"LessonType"
        END;
      ALTER TABLE lessons ALTER COLUMN slug SET NOT NULL;
      ALTER TABLE lessons ALTER COLUMN updated_at SET DEFAULT now();
      ALTER TABLE lessons ALTER COLUMN updated_at SET NOT NULL;

      ALTER TABLE lessons DROP CONSTRAINT lessons_chapter_position_unique;
      ALTER TABLE lessons
        ADD CONSTRAINT "UQ_lessons_chapter_position" UNIQUE(chapter_id, position),
        ADD CONSTRAINT "UQ_lessons_chapter_slug" UNIQUE(chapter_id, slug),
        ADD CONSTRAINT lessons_title_check CHECK (btrim(title) <> ''),
        ADD CONSTRAINT lessons_slug_check CHECK (btrim(slug) <> ''),
        ADD CONSTRAINT lessons_video_duration_check CHECK (video_duration_seconds IS NULL OR video_duration_seconds >= 0),
        ADD CONSTRAINT lessons_document_file_size_check CHECK (document_file_size IS NULL OR document_file_size >= 0),
        ADD CONSTRAINT lessons_content_discriminator_check CHECK (
          (type = 'TEXT' AND video_asset_id IS NULL AND video_external_url IS NULL AND video_provider IS NULL
            AND video_duration_seconds IS NULL AND video_status IS NULL AND document_asset_id IS NULL
            AND document_file_name IS NULL AND document_file_size IS NULL AND document_download_allowed IS NULL)
          OR
          (type = 'VIDEO' AND text_body IS NULL AND document_asset_id IS NULL AND document_file_name IS NULL
            AND document_file_size IS NULL AND document_download_allowed IS NULL)
          OR
          (type = 'DOCUMENT' AND text_body IS NULL AND video_asset_id IS NULL AND video_external_url IS NULL
            AND video_provider IS NULL AND video_duration_seconds IS NULL AND video_status IS NULL)
        ),
        ADD CONSTRAINT lessons_video_reference_check CHECK (
          type <> 'VIDEO'
          OR (video_external_url IS NULL AND (video_provider IS NULL OR video_provider = 'S3'))
          OR (video_asset_id IS NULL AND video_provider IN ('YOUTUBE', 'VIMEO'))
        ),
        ADD CONSTRAINT lessons_published_content_check CHECK (
          NOT is_published
          OR (type = 'TEXT' AND NULLIF(btrim(text_body), '') IS NOT NULL)
          OR (type = 'VIDEO' AND num_nonnulls(video_asset_id, video_external_url) = 1
              AND video_provider IS NOT NULL AND video_status = 'READY')
          OR (type = 'DOCUMENT' AND NULLIF(btrim(document_asset_id), '') IS NOT NULL
              AND NULLIF(btrim(document_file_name), '') IS NOT NULL
              AND document_file_size IS NOT NULL AND document_download_allowed IS NOT NULL)
        );

      CREATE INDEX lessons_chapter_position_idx ON lessons(chapter_id, position);
      CREATE INDEX lessons_chapter_published_position_idx ON lessons(chapter_id, is_published, position);
      CREATE FUNCTION touch_lesson_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
      CREATE TRIGGER lessons_updated_at BEFORE UPDATE ON lessons
        FOR EACH ROW EXECUTE FUNCTION touch_lesson_updated_at();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER lessons_updated_at ON lessons;
      DROP FUNCTION touch_lesson_updated_at();
      DROP INDEX lessons_chapter_published_position_idx;
      DROP INDEX lessons_chapter_position_idx;

      ALTER TABLE lessons
        DROP CONSTRAINT lessons_published_content_check,
        DROP CONSTRAINT lessons_video_reference_check,
        DROP CONSTRAINT lessons_content_discriminator_check,
        DROP CONSTRAINT lessons_document_file_size_check,
        DROP CONSTRAINT lessons_video_duration_check,
        DROP CONSTRAINT lessons_slug_check,
        DROP CONSTRAINT lessons_title_check,
        DROP CONSTRAINT "UQ_lessons_chapter_slug",
        DROP CONSTRAINT "UQ_lessons_chapter_position";

      UPDATE lessons
      SET body = CASE WHEN type = 'TEXT' THEN COALESCE(text_body, '') ELSE body END,
          video_storage_key = CASE WHEN type = 'VIDEO' THEN COALESCE(video_asset_id, video_external_url) ELSE video_storage_key END,
          duration_seconds = CASE WHEN type = 'VIDEO' THEN video_duration_seconds ELSE duration_seconds END;

      ALTER TABLE lessons ALTER COLUMN type TYPE text
        USING CASE type
          WHEN 'TEXT' THEN 'Article'
          WHEN 'VIDEO' THEN 'Video'
          WHEN 'DOCUMENT' THEN 'Article'
        END;
      ALTER TABLE lessons ALTER COLUMN type SET DEFAULT 'Article';
      ALTER TABLE lessons ADD CONSTRAINT lessons_type_check CHECK (type IN ('Article', 'Video', 'Quiz'));

      ALTER TABLE lessons ALTER COLUMN chapter_id DROP NOT NULL;
      UPDATE lessons
      SET chapter_id = NULL
      WHERE section_id IS NOT NULL
        AND chapter_id = uuid_generate_v5('${LEGACY_CHAPTER_NAMESPACE}'::uuid, section_id::text);
      DELETE FROM chapters chapter
      USING course_sections section
      WHERE chapter.id = uuid_generate_v5('${LEGACY_CHAPTER_NAMESPACE}'::uuid, section.id::text)
        AND NOT EXISTS (SELECT 1 FROM lessons lesson WHERE lesson.chapter_id = chapter.id);

      ALTER TABLE lessons
        DROP COLUMN slug,
        DROP COLUMN is_published,
        DROP COLUMN text_body,
        DROP COLUMN video_asset_id,
        DROP COLUMN video_external_url,
        DROP COLUMN video_provider,
        DROP COLUMN video_duration_seconds,
        DROP COLUMN video_status,
        DROP COLUMN document_asset_id,
        DROP COLUMN document_file_name,
        DROP COLUMN document_file_size,
        DROP COLUMN document_download_allowed,
        DROP COLUMN updated_at,
        ALTER COLUMN title TYPE text,
        ALTER COLUMN id SET DEFAULT gen_random_uuid(),
        ADD CONSTRAINT lessons_parent_check CHECK (num_nonnulls(section_id, chapter_id) = 1),
        ADD CONSTRAINT lessons_chapter_position_unique UNIQUE(chapter_id, position) DEFERRABLE INITIALLY DEFERRED;

      DROP TYPE "MediaProcessingStatus";
      DROP TYPE "VideoProvider";
      DROP TYPE "LessonType";
    `);
  }
}
