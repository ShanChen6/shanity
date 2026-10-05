export class VideoProviderConstraint1791158400002 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons DROP CONSTRAINT lessons_video_reference_check;
      ALTER TABLE lessons ADD CONSTRAINT lessons_video_reference_check CHECK (
        type <> 'VIDEO'
        OR (video_external_url IS NULL AND video_provider::text IN ('LOCAL', 'S3'))
        OR (video_asset_id IS NULL AND video_provider::text IN ('EXTERNAL_EMBED', 'YOUTUBE', 'VIMEO'))
      );
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons DROP CONSTRAINT lessons_video_reference_check;
      ALTER TABLE lessons ADD CONSTRAINT lessons_video_reference_check CHECK (
        type <> 'VIDEO'
        OR (video_external_url IS NULL AND (video_provider IS NULL OR video_provider = 'S3'))
        OR (video_asset_id IS NULL AND video_provider IN ('YOUTUBE', 'VIMEO'))
      );
    `);
    }
}
//# sourceMappingURL=202610050002_video_provider_constraint.js.map