export class DocumentLessonMetadata1791158400004 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "DocumentFileType" AS ENUM ('PDF', 'SLIDE', 'DOCX', 'OTHER');
      ALTER TABLE lessons
        ADD COLUMN document_mime_type text,
        ADD COLUMN document_file_type "DocumentFileType";
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons
        DROP COLUMN document_file_type,
        DROP COLUMN document_mime_type;
      DROP TYPE "DocumentFileType";
    `);
    }
}
//# sourceMappingURL=202610050004_document_lesson_metadata.js.map