import { createAppDataSource } from './typeorm.js';

// For TypeORM schema inspection/generation. Use database/cli.mjs for migrations
// so legacy-history validation and the migration lock are always applied.
export default createAppDataSource();
