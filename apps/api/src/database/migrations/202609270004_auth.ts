import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Auth1790467200004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
  `);
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Use a reviewed forward migration; auth data must not be dropped.',
    );
  }
}
