import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C9: blog comments with automated moderation.
 *
 * - post_comments: every submitted comment is stored, whatever the verdict,
 *   so decisions can be reviewed. `is_approved` is what the public sees and
 *   is held equal to `status = 'APPROVED'` by a CHECK, so the two can never
 *   disagree. `moderation` keeps the pipeline's evidence (rule hit, provider,
 *   category scores, trust inputs).
 * - post_comment_review_logs: append-only audit of every manual decision by
 *   an admin (docs/permissions.md: moderating comments is audited).
 */
export class PostComments1792800000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "CommentStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');
      CREATE TABLE post_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id uuid NOT NULL,
        author_id uuid NOT NULL,
        content text NOT NULL,
        status "CommentStatus" NOT NULL,
        is_approved boolean NOT NULL,
        toxicity_score real,
        rejection_reason text,
        moderation jsonb NOT NULL DEFAULT '{}'::jsonb,
        reviewed_by uuid,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_post_comments_approved"
          CHECK (is_approved = (status = 'APPROVED')),
        CONSTRAINT "CHK_post_comments_content"
          CHECK (btrim(content) <> '' AND char_length(content) <= 2000),
        CONSTRAINT "CHK_post_comments_score"
          CHECK (toxicity_score IS NULL OR toxicity_score BETWEEN 0 AND 1),
        CONSTRAINT "CHK_post_comments_review"
          CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
        CONSTRAINT "FK_post_comments_post"
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        CONSTRAINT "FK_post_comments_author"
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT "FK_post_comments_reviewed_by"
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      );
      -- The public thread of a post.
      CREATE INDEX "IDX_post_comments_post_approved"
        ON post_comments (post_id, created_at, id) WHERE status = 'APPROVED';
      -- The admin queue.
      CREATE INDEX "IDX_post_comments_pending"
        ON post_comments (created_at) WHERE status = 'PENDING';
      -- Trust (approved count) and duplicate checks per author.
      CREATE INDEX "IDX_post_comments_author"
        ON post_comments (author_id, status, created_at);
      CREATE TRIGGER post_comments_set_updated_at BEFORE UPDATE ON post_comments
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TABLE post_comment_review_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        comment_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        from_status "CommentStatus" NOT NULL,
        to_status "CommentStatus" NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_post_comment_review_logs_comment"
          FOREIGN KEY (comment_id) REFERENCES post_comments(id)
          ON DELETE CASCADE,
        CONSTRAINT "FK_post_comment_review_logs_actor"
          FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_post_comment_review_logs_comment"
        ON post_comment_review_logs (comment_id, created_at);
      CREATE FUNCTION post_comment_review_logs_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        -- Rows go only with their comment (author or post deleted).
        IF TG_OP = 'DELETE' AND NOT EXISTS (
          SELECT 1 FROM post_comments WHERE id = OLD.comment_id) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Comment review records are immutable'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'TRG_post_comment_review_logs_immutable';
      END $$;
      CREATE TRIGGER post_comment_review_logs_immutable
        BEFORE UPDATE OR DELETE ON post_comment_review_logs
        FOR EACH ROW EXECUTE FUNCTION post_comment_review_logs_immutable();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE post_comment_review_logs;
      DROP FUNCTION post_comment_review_logs_immutable();
      DROP TABLE post_comments;
      DROP TYPE "CommentStatus";
    `);
  }
}
