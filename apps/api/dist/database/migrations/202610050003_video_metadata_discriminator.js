export class VideoMetadataDiscriminator1791158400003 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons DROP CONSTRAINT lessons_content_discriminator_check;
      ALTER TABLE lessons ADD CONSTRAINT lessons_content_discriminator_check CHECK (
        (type = 'TEXT' AND video_asset_id IS NULL AND video_external_url IS NULL AND video_provider IS NULL
          AND video_duration_seconds IS NULL AND video_file_size IS NULL AND video_mime_type IS NULL
          AND video_status IS NULL AND document_asset_id IS NULL AND document_file_name IS NULL
          AND document_file_size IS NULL AND document_download_allowed IS NULL)
        OR
        (type = 'VIDEO' AND text_body IS NULL AND document_asset_id IS NULL AND document_file_name IS NULL
          AND document_file_size IS NULL AND document_download_allowed IS NULL)
        OR
        (type = 'DOCUMENT' AND text_body IS NULL AND video_asset_id IS NULL AND video_external_url IS NULL
          AND video_provider IS NULL AND video_duration_seconds IS NULL AND video_file_size IS NULL
          AND video_mime_type IS NULL AND video_status IS NULL)
      );
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons DROP CONSTRAINT lessons_content_discriminator_check;
      ALTER TABLE lessons ADD CONSTRAINT lessons_content_discriminator_check CHECK (
        (type = 'TEXT' AND video_asset_id IS NULL AND video_external_url IS NULL AND video_provider IS NULL
          AND video_duration_seconds IS NULL AND video_status IS NULL AND document_asset_id IS NULL
          AND document_file_name IS NULL AND document_file_size IS NULL AND document_download_allowed IS NULL)
        OR
        (type = 'VIDEO' AND text_body IS NULL AND document_asset_id IS NULL AND document_file_name IS NULL
          AND document_file_size IS NULL AND document_download_allowed IS NULL)
        OR
        (type = 'DOCUMENT' AND text_body IS NULL AND video_asset_id IS NULL AND video_external_url IS NULL
          AND video_provider IS NULL AND video_duration_seconds IS NULL AND video_status IS NULL)
      );
    `);
    }
}
//# sourceMappingURL=202610050003_video_metadata_discriminator.js.map