import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';

// Resolve from source and compiled modules independently of the working directory.
try {
  loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export function databaseConfig(): DataSourceOptions {
  if (!process.env.PGPASSWORD) throw new Error('PGPASSWORD is required');
  return {
    type: 'postgres',
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    username: process.env.PGUSER ?? 'shanity',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? 'shanity',
    synchronize: false,
    migrationsRun: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    poolSize: 10,
    extra: { options: '-c timezone=UTC', connectionTimeoutMillis: 5000 },
  };
}
