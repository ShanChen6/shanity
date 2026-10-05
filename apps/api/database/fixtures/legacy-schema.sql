-- Frozen schema from the six pre-TypeORM migrations; test fixture only.

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
      display_name text NOT NULL,
      password_hash text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(email)
    );
    CREATE TABLE auth_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      provider text NOT NULL,
      provider_subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, provider_subject)
    );
    CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);
    CREATE TABLE courses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE course_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      title text NOT NULL,
      position integer NOT NULL CHECK(position >= 0),
      UNIQUE(course_id, position),
      UNIQUE(id, course_id)
    );
    CREATE TABLE lessons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      section_id uuid NOT NULL,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      video_storage_key text,
      duration_seconds integer CHECK(duration_seconds >= 0),
      position integer NOT NULL CHECK(position >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(section_id, course_id) REFERENCES course_sections(id, course_id) ON DELETE RESTRICT,
      UNIQUE(section_id, position),
      UNIQUE(id, course_id)
    );
    CREATE INDEX lessons_course_idx ON lessons(course_id);
    CREATE TABLE lesson_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      title text NOT NULL,
      storage_key text NOT NULL,
      media_type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX lesson_assets_lesson_idx ON lesson_assets(lesson_id);
    CREATE TABLE enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      enrolled_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz CHECK(revoked_at >= enrolled_at),
      UNIQUE(user_id, course_id),
      UNIQUE(id, course_id)
    );
    CREATE INDEX enrollments_course_idx ON enrollments(course_id);
    CREATE TABLE lesson_progress (
      enrollment_id uuid NOT NULL,
      lesson_id uuid NOT NULL,
      course_id uuid NOT NULL,
      last_position_seconds integer NOT NULL DEFAULT 0 CHECK(last_position_seconds >= 0),
      watched_seconds integer NOT NULL DEFAULT 0 CHECK(watched_seconds >= 0),
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(enrollment_id, lesson_id),
      FOREIGN KEY(enrollment_id, course_id) REFERENCES enrollments(id, course_id) ON DELETE RESTRICT,
      FOREIGN KEY(lesson_id, course_id) REFERENCES lessons(id, course_id) ON DELETE RESTRICT
    );
    CREATE INDEX lesson_progress_lesson_idx ON lesson_progress(lesson_id, course_id);
    CREATE FUNCTION touch_lesson_progress() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    CREATE TRIGGER lesson_progress_updated BEFORE UPDATE ON lesson_progress
      FOR EACH ROW EXECUTE FUNCTION touch_lesson_progress();
  

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
  

    CREATE TABLE roles (
      code text PRIMARY KEY,
      name text NOT NULL
    );
    INSERT INTO roles(code, name) VALUES
      ('student', 'Học sinh'), ('instructor', 'Giảng viên'), ('admin', 'Quản trị viên');
    CREATE TABLE user_roles (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      role_code text NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, role_code)
    );
    CREATE INDEX user_roles_role_idx ON user_roles(role_code);

    -- Existing courses retain their data; ownership must be assigned explicitly.
    ALTER TABLE courses ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE RESTRICT;
    CREATE INDEX courses_owner_idx ON courses(owner_id);
    CREATE TABLE course_instructors (
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(course_id, user_id)
    );
    CREATE INDEX course_instructors_user_idx ON course_instructors(user_id);

    ALTER TABLE courses DROP CONSTRAINT courses_status_check;
    ALTER TABLE courses ADD CONSTRAINT courses_status_check
      CHECK(status IN ('draft', 'review', 'published', 'hidden', 'archived'));
    ALTER TABLE posts DROP CONSTRAINT posts_status_check;
    ALTER TABLE posts ADD CONSTRAINT posts_status_check
      CHECK(status IN ('draft', 'review', 'published', 'hidden', 'archived'));
  

    ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK(status IN ('active', 'disabled'));
    CREATE TABLE auth_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      refresh_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
    CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE TABLE oauth_requests (
      state_hash text PRIMARY KEY,
      browser_hash text NOT NULL,
      nonce text NOT NULL,
      verifier text NOT NULL,
      link_session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX oauth_requests_expiry_idx ON oauth_requests(expires_at);
    CREATE TABLE auth_rate_limits (
      key text PRIMARY KEY,
      hits integer NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
  

    ALTER TABLE users ADD COLUMN update_at timestamptz;
    -- Historical update times are unknown; creation is the baseline.
    UPDATE users SET update_at = created_at;
    ALTER TABLE users ALTER COLUMN update_at SET DEFAULT now();
    ALTER TABLE users ALTER COLUMN update_at SET NOT NULL;
    CREATE FUNCTION touch_user_update_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.update_at = clock_timestamp(); RETURN NEW; END $$;
    CREATE TRIGGER users_update_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION touch_user_update_at();
  
ALTER TABLE users ADD COLUMN avatar_key text;