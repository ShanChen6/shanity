import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class DatabaseService implements OnModuleInit, OnApplicationShutdown {
    readonly dataSource: DataSource;
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
