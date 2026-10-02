import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Community1790467200002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE TABLE categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      name text NOT NULL
    );
    CREATE TABLE posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(status <> 'published' OR published_at IS NOT NULL)
    );
    CREATE INDEX posts_author_idx ON posts(author_id);
    CREATE INDEX posts_published_idx ON posts(published_at DESC, id) WHERE status = 'published';
    CREATE TABLE post_categories (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      PRIMARY KEY(post_id, category_id)
    );
    CREATE INDEX post_categories_category_idx ON post_categories(category_id);
    CREATE TABLE chat_rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX chat_rooms_course_idx ON chat_rooms(course_id);
    CREATE TABLE chat_members (
      room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      joined_at timestamptz NOT NULL DEFAULT now(),
      left_at timestamptz CHECK(left_at >= joined_at),
      PRIMARY KEY(room_id, user_id)
    );
    CREATE INDEX chat_members_user_idx ON chat_members(user_id);
    CREATE TABLE messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL,
      sender_id uuid NOT NULL,
      body text NOT NULL CHECK(length(btrim(body)) > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(room_id, sender_id) REFERENCES chat_members(room_id, user_id) ON DELETE RESTRICT
    );
    CREATE INDEX messages_history_idx ON messages(room_id, created_at DESC, id);
    CREATE INDEX messages_sender_idx ON messages(room_id, sender_id);
  `);
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Use a reviewed forward migration.',
    );
  }
}
