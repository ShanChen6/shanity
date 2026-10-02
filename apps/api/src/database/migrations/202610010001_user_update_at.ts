import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserUpdateAt1790812800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    ALTER TABLE users ADD COLUMN update_at timestamptz;
    -- Historical update times are unknown; creation is the baseline.
    UPDATE users SET update_at = created_at;
    ALTER TABLE users ALTER COLUMN update_at SET DEFAULT now();
    ALTER TABLE users ALTER COLUMN update_at SET NOT NULL;
    CREATE FUNCTION touch_user_update_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.update_at = clock_timestamp(); RETURN NEW; END $$;
    CREATE TRIGGER users_update_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION touch_user_update_at();
  `);
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Use a reviewed forward migration.',
    );
  }
}
