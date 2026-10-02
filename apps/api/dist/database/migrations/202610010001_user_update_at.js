export class UserUpdateAt1790812800001 {
    async up(queryRunner) {
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
    async down(_queryRunner) {
        throw new Error('Destructive rollback disabled. Use a reviewed forward migration.');
    }
}
//# sourceMappingURL=202610010001_user_update_at.js.map