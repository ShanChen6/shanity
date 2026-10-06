import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentLessonMetadata1791158400004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "DocumentFileType" AS ENUM ('PDF', 'SLIDE', 'DOCX', 'OTHER');
      ALTER TABLE lessons
        ADD COLUMN document_mime_type text,
        ADD COLUMN document_file_type "DocumentFileType";
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lessons
        DROP COLUMN document_file_type,
        DROP COLUMN document_mime_type;
      DROP TYPE "DocumentFileType";
    `);
  }
}
