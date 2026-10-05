import type { DataSource } from 'typeorm';
export declare function migrateDatabase(source: DataSource, options?: {
    adoptLegacy?: boolean;
    revert?: boolean;
}): Promise<import("typeorm").Migration[]>;
