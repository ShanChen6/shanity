export class InstructorPortal1790899200005 {
    async up(runner) {
        await runner.query(`
      ALTER TABLE courses
        ADD COLUMN category text NOT NULL DEFAULT 'General',
        ADD COLUMN level text NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner','Intermediate','Advanced')),
        ADD COLUMN language text NOT NULL DEFAULT 'vi',
        ADD COLUMN price integer NOT NULL DEFAULT 0 CHECK (price >= 0);
      ALTER TABLE chapters ADD CONSTRAINT chapters_id_course_unique UNIQUE(id, course_id);
      ALTER TABLE lessons ALTER COLUMN section_id DROP NOT NULL;
      ALTER TABLE lessons ADD COLUMN chapter_id uuid,
        ADD COLUMN type text NOT NULL DEFAULT 'Article' CHECK (type IN ('Article','Video','Quiz')),
        ADD CONSTRAINT lessons_chapter_fk FOREIGN KEY(chapter_id, course_id) REFERENCES chapters(id, course_id) ON DELETE CASCADE,
        ADD CONSTRAINT lessons_parent_check CHECK (num_nonnulls(section_id, chapter_id) = 1),
        ADD CONSTRAINT lessons_chapter_position_unique UNIQUE(chapter_id, position) DEFERRABLE INITIALLY DEFERRED;
      CREATE INDEX lessons_chapter_idx ON lessons(chapter_id);
      CREATE TABLE course_media (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX course_media_course_idx ON course_media(course_id);
    `);
    }
    async down() {
        throw new Error('Destructive rollback disabled; write a reviewed forward migration.');
    }
}
//# sourceMappingURL=202610020005_instructor_portal.js.map