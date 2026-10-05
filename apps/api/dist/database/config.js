import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
try {
    loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
}
catch (error) {
    if (error.code !== 'ENOENT')
        throw error;
}
export function databaseConfig() {
    if (!process.env.PGPASSWORD)
        throw new Error('PGPASSWORD is required');
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
//# sourceMappingURL=config.js.map