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
        client: 'pg',
        connection: {
            host: process.env.PGHOST ?? 'localhost',
            port: Number(process.env.PGPORT ?? 5432),
            user: process.env.PGUSER ?? 'shanity',
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE ?? 'shanity',
            options: '-c timezone=UTC',
            connectionTimeoutMillis: 5000,
        },
        pool: { min: 0, max: 10 },
        acquireConnectionTimeout: 5000,
        compileSqlOnError: false,
    };
}
//# sourceMappingURL=config.js.map