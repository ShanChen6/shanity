import { createAppDataSource } from '../dist/database/typeorm.js';
import { migrateDatabase } from '../dist/database/migrate.js';
import { seed as demo } from './seeds/001_demo.mjs';
import { seed as admin } from './seeds/002_super_admin.mjs';
import { seedSampleCourse } from '../dist/database/seeds/sample-course.seed.js';
import { seedDemoAccounts } from '../dist/database/seeds/demo-accounts.seed.js';

const command = process.argv[2];
if (!['migrate', 'revert', 'adopt-legacy', 'seed', 'seed-admin', 'seed-course', 'seed-demo'].includes(command)) {
  throw new Error(
    'Usage: node database/cli.mjs migrate|revert|adopt-legacy|seed|seed-admin|seed-course|seed-demo',
  );
}
const db = createAppDataSource();
try {
  await db.initialize();
  if (command === 'seed') {
    await demo(db);
    await seedSampleCourse(db);
    await seedDemoAccounts(db);
    await admin(db);
    console.log('Seeds complete');
  } else if (command === 'seed-admin') {
    await admin(db);
    console.log('Super admin seed complete');
  } else if (command === 'seed-demo') {
    await seedDemoAccounts(db);
    console.log('Demo accounts (admin, instructor, student, finance) seeded');
  } else if (command === 'seed-course') {
    await seedSampleCourse(db);
    console.log('Sample JavaScript course seed complete');
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
