import { fileURLToPath } from 'node:url';
import { databaseConfig } from '../src/database/config.ts';
export default {
  ...databaseConfig(),
  migrations: { directory: fileURLToPath(new URL('./migrations', import.meta.url)), loadExtensions: ['.mjs'] },
  seeds: { directory: fileURLToPath(new URL('./seeds', import.meta.url)), loadExtensions: ['.mjs'] },
};
