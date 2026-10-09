import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Legacy text status -> BlogPostStatus, and back for `down`. */
const STATUS_UP = `CASE status
  WHEN 'draft' THEN 'DRAFT' WHEN 'review' THEN 'PENDING_REVIEW'
  WHEN 'published' THEN 'PUBLISHED' WHEN 'hidden' THEN 'HIDDEN'
  WHEN 'archived' THEN 'ARCHIVED' END`;
const STATUS_DOWN = `CASE status::text
  WHEN 'DRAFT' THEN 'draft' WHEN 'PENDING_REVIEW' THEN 'review'
  WHEN 'PUBLISHED' THEN 'published' WHEN 'HIDDEN' THEN 'hidden'
  WHEN 'ARCHIVED' THEN 'archived' END`;

/**
 * C7: the tech blog, built on the foundation's `posts` and `categories`
 * (unused until now) rather than beside them.
 *
 * - posts.status becomes the BlogPostStatus enum. Existing values keep their
 *   meaning (docs/permissions.md): draft -> DRAFT, review -> PENDING_REVIEW,
 *   published, hidden, archived likewise.
 * - body -> content (Markdown with KaTeX), plus excerpt, cover image, one
 *   category (posts that had several keep their first), a linked course,
 *   the review fields and updated_at. post_categories is dropped.
 * - A trigger enforces the editorial workflow
 *   DRAFT -> PENDING_REVIEW -> PUBLISHED (rejection and withdrawal go back to
 *   DRAFT; a published post can be hidden and shown again; anything can be
 *   archived), and freezes what links point to once a post was published:
 *   its slug and first publication time.
 * - post_review_logs: append-only audit of every workflow step (who, from,
 *   to, note), as docs/permissions.md requires for approving and hiding.
 * - categories gains audit columns and sane slug/name checks.
 */
export class BlogPosts1792713600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE categories
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT "CHK_categories_name" CHECK (btrim(name) <> ''),
        ADD CONSTRAINT "CHK_categories_slug"
          CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
      CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TYPE "BlogPostStatus" AS ENUM
        ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');
      -- The partial index compares status as text: rebuilt after the change.
      DROP INDEX posts_published_idx;
      ALTER TABLE posts
        DROP CONSTRAINT posts_status_check,
        DROP CONSTRAINT posts_check,
        ALTER COLUMN status DROP DEFAULT;
      ALTER TABLE posts
        ALTER COLUMN status TYPE "BlogPostStatus"
          USING (${STATUS_UP})::"BlogPostStatus",
        ALTER COLUMN status SET DEFAULT 'DRAFT';
      ALTER TABLE posts RENAME COLUMN body TO content;
      ALTER TABLE posts
        ADD COLUMN excerpt text,
        ADD COLUMN cover_image text,
        ADD COLUMN category_id uuid,
        ADD COLUMN linked_course_id uuid,
        ADD COLUMN submitted_at timestamptz,
        ADD COLUMN reviewed_by uuid,
        ADD COLUMN reviewed_at timestamptz,
        ADD COLUMN review_note text,
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      UPDATE posts SET
        category_id = (
          SELECT pc.category_id FROM post_categories pc
          WHERE pc.post_id = posts.id ORDER BY pc.category_id LIMIT 1),
        updated_at = coalesce(published_at, created_at);
      DROP TABLE post_categories;

      ALTER TABLE posts
        ADD CONSTRAINT "FK_posts_category"
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_posts_linked_course"
          FOREIGN KEY (linked_course_id) REFERENCES courses(id)
          ON DELETE SET NULL,
        ADD CONSTRAINT "FK_posts_reviewed_by"
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT "CHK_posts_published"
          CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
        ADD CONSTRAINT "CHK_posts_title" CHECK (btrim(title) <> ''),
        ADD CONSTRAINT "CHK_posts_slug"
          CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 200),
        ADD CONSTRAINT "CHK_posts_excerpt"
          CHECK (excerpt IS NULL OR char_length(excerpt) <= 500),
        ADD CONSTRAINT "CHK_posts_review"
          CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL));

      CREATE INDEX "IDX_posts_published"
        ON posts (published_at DESC, id) WHERE status = 'PUBLISHED';
      CREATE INDEX "IDX_posts_category_published"
        ON posts (category_id, published_at DESC) WHERE status = 'PUBLISHED';
      CREATE INDEX "IDX_posts_author_updated" ON posts (author_id, updated_at DESC);
      CREATE INDEX "IDX_posts_review_queue"
        ON posts (submitted_at) WHERE status = 'PENDING_REVIEW';
      CREATE INDEX "IDX_posts_linked_course" ON posts (linked_course_id)
        WHERE linked_course_id IS NOT NULL;
      DROP INDEX posts_author_idx;
      CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON posts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE FUNCTION posts_guard_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.author_id <> OLD.author_id THEN
          RAISE EXCEPTION 'Post % author is immutable', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_posts_author';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
             (OLD.status = 'DRAFT' AND NEW.status = 'PENDING_REVIEW')
          OR (OLD.status = 'PENDING_REVIEW' AND NEW.status IN ('DRAFT', 'PUBLISHED'))
          OR (OLD.status = 'PUBLISHED' AND NEW.status = 'HIDDEN')
          OR (OLD.status = 'HIDDEN' AND NEW.status = 'PUBLISHED')
          OR NEW.status = 'ARCHIVED'
        ) THEN
          RAISE EXCEPTION 'Illegal post status transition % -> %',
            OLD.status, NEW.status
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_posts_transition';
        END IF;
        -- Links and feeds point at a published post: keep them valid.
        IF OLD.published_at IS NOT NULL AND (
             NEW.published_at IS DISTINCT FROM OLD.published_at
          OR NEW.slug <> OLD.slug) THEN
          RAISE EXCEPTION 'Post % slug and first publication are frozen', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_posts_published_frozen';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER posts_guard_update BEFORE UPDATE ON posts
        FOR EACH ROW EXECUTE FUNCTION posts_guard_update();

      CREATE TABLE post_review_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        from_status "BlogPostStatus" NOT NULL,
        to_status "BlogPostStatus" NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_post_review_logs_note"
          CHECK (note IS NULL OR btrim(note) <> ''),
        CONSTRAINT "FK_post_review_logs_post"
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_post_review_logs_actor"
          FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_post_review_logs_post"
        ON post_review_logs (post_id, created_at);
      CREATE FUNCTION post_review_logs_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Post review records are immutable'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'TRG_post_review_logs_immutable';
      END $$;
      CREATE TRIGGER post_review_logs_immutable
        BEFORE UPDATE OR DELETE ON post_review_logs
        FOR EACH ROW EXECUTE FUNCTION post_review_logs_immutable();
      CREATE TRIGGER post_review_logs_no_truncate
        BEFORE TRUNCATE ON post_review_logs
        FOR EACH STATEMENT EXECUTE FUNCTION post_review_logs_immutable();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM post_review_logs) THEN
          RAISE EXCEPTION 'post_review_logs holds audit data; refusing to drop it';
        END IF;
      END $$;
      DROP TABLE post_review_logs;
      DROP FUNCTION post_review_logs_immutable();
      DROP TRIGGER posts_guard_update ON posts;
      DROP FUNCTION posts_guard_update();
      DROP TRIGGER posts_set_updated_at ON posts;

      CREATE TABLE post_categories (
        post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        PRIMARY KEY(post_id, category_id)
      );
      CREATE INDEX post_categories_category_idx ON post_categories(category_id);
      INSERT INTO post_categories(post_id, category_id)
        SELECT id, category_id FROM posts WHERE category_id IS NOT NULL;

      DROP INDEX "IDX_posts_published";
      DROP INDEX "IDX_posts_category_published";
      DROP INDEX "IDX_posts_author_updated";
      DROP INDEX "IDX_posts_review_queue";
      DROP INDEX "IDX_posts_linked_course";
      ALTER TABLE posts
        DROP CONSTRAINT "FK_posts_category",
        DROP CONSTRAINT "FK_posts_linked_course",
        DROP CONSTRAINT "FK_posts_reviewed_by",
        DROP CONSTRAINT "CHK_posts_published",
        DROP CONSTRAINT "CHK_posts_title",
        DROP CONSTRAINT "CHK_posts_slug",
        DROP CONSTRAINT "CHK_posts_excerpt",
        DROP CONSTRAINT "CHK_posts_review",
        DROP COLUMN excerpt,
        DROP COLUMN cover_image,
        DROP COLUMN category_id,
        DROP COLUMN linked_course_id,
        DROP COLUMN submitted_at,
        DROP COLUMN reviewed_by,
        DROP COLUMN reviewed_at,
        DROP COLUMN review_note,
        DROP COLUMN updated_at,
        ALTER COLUMN status DROP DEFAULT;
      ALTER TABLE posts RENAME COLUMN content TO body;
      ALTER TABLE posts
        ALTER COLUMN status TYPE text USING (${STATUS_DOWN}),
        ALTER COLUMN status SET DEFAULT 'draft',
        ADD CONSTRAINT posts_status_check CHECK(status IN
          ('draft', 'review', 'published', 'hidden', 'archived')),
        ADD CONSTRAINT posts_check
          CHECK(status <> 'published' OR published_at IS NOT NULL);
      DROP TYPE "BlogPostStatus";
      CREATE INDEX posts_author_idx ON posts(author_id);
      CREATE INDEX posts_published_idx ON posts(published_at DESC, id)
        WHERE status = 'published';

      DROP TRIGGER categories_set_updated_at ON categories;
      ALTER TABLE categories
        DROP CONSTRAINT "CHK_categories_name",
        DROP CONSTRAINT "CHK_categories_slug",
        DROP COLUMN created_at,
        DROP COLUMN updated_at;
    `);
  }
}
