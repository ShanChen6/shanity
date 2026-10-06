import type { DataSource } from 'typeorm';
import { migrateDatabase } from '../../src/database/migrate.js';

/**
 * Reverts migrations newest-first until `name` is undone, so a migration's
 * own revert test keeps working as later migrations are stacked on top.
 */
export async function revertThrough(
  db: DataSource,
  schema: string,
  name: string,
) {
  const applied = async () =>
    (
      await db.query(
        `SELECT 1 FROM "${schema}".typeorm_migrations WHERE name = $1`,
        [name],
      )
    ).length > 0;
  if (!(await applied())) throw new Error(`${name} is not applied`);
  while (await applied()) await migrateDatabase(db, { revert: true });
}
