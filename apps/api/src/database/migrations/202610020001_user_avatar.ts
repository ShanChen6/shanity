import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAvatar1790899200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE users ADD COLUMN avatar_key text');
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Use a reviewed forward migration.',
    );
  }
}
