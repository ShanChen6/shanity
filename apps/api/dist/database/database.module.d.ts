import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { type Knex } from 'knex';
export declare class DatabaseService implements OnModuleInit, OnApplicationShutdown {
    readonly client: Knex;
    onModuleInit(): Promise<void>;
    onApplicationShutdown(): Promise<void>;
}
export declare class DatabaseHealthController {
    private readonly database;
    constructor(database: DatabaseService);
    check(): Promise<{
        status: string;
    }>;
}
export declare class DatabaseModule {
}
