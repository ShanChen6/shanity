import { createAppDataSource } from '../dist/database/typeorm.js';
import { migrateDatabase } from '../dist/database/migrate.js';
import { seed as demo } from './seeds/001_demo.mjs';
import { seed as admin } from './seeds/002_super_admin.mjs';

const command = process.argv[2];
if (!['migrate', 'revert', 'adopt-legacy', 'seed'].includes(command)) {
  throw new Error(
    'Usage: node database/cli.mjs migrate|revert|adopt-legacy|seed',
  );
}
const db = createAppDataSource();
try {
  await db.initialize();
  if (command === 'seed') {
    await demo(db);
    await admin(db);
    console.log('Seeds complete');
  } else {
    const completed = await migrateDatabase(db, {
      adoptLegacy: command === 'adopt-legacy',
      revert: command === 'revert',
    });
    console.log(
      command === 'revert'
        ? 'Last migration reverted'
        : `Migrations complete: ${completed.length} applied`,
    );
  }
} finally {
  if (db.isInitialized) await db.destroy();
}
