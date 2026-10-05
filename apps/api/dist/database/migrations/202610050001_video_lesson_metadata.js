export class VideoLessonMetadata1791158400001 {
    async up(queryRunner) {
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
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons
        DROP CONSTRAINT lessons_video_mime_type_check,
        DROP CONSTRAINT lessons_video_file_size_check,
        DROP COLUMN video_mime_type,
        DROP COLUMN video_file_size;
    `);
    }
}
//# sourceMappingURL=202610050001_video_lesson_metadata.js.map