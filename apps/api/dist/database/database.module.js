var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Controller, Get, Injectable, Module, ServiceUnavailableException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAppDataSource } from './typeorm.js';
let DatabaseService = class DatabaseService {
    dataSource = createAppDataSource();
    async onModuleInit() {
        try {
            await this.dataSource.initialize();
        }
        catch {
            if (this.dataSource.isInitialized)
                await this.dataSource.destroy();
            throw new Error('PostgreSQL unavailable; check database configuration and readiness');
        }
    }
    async onApplicationShutdown() {
        if (this.dataSource.isInitialized)
            await this.dataSource.destroy();
    }
};
DatabaseService = __decorate([
    Injectable()
], DatabaseService);
export { DatabaseService };
let DatabaseHealthController = class DatabaseHealthController {
    database;
    constructor(database) {
        this.database = database;
    }
    async check() {
        try {
            await this.database.dataSource.transaction(async (manager) => {
                await manager.query("SET LOCAL statement_timeout = '5s'");
                await manager.query('SELECT 1');
            });
            return { status: 'ok' };
        }
        catch {
            throw new ServiceUnavailableException('Database unavailable');
        }
    }
};
__decorate([
    Get('db'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DatabaseHealthController.prototype, "check", null);
DatabaseHealthController = __decorate([
    Controller('health'),
    __metadata("design:paramtypes", [DatabaseService])
], DatabaseHealthController);
export { DatabaseHealthController };
let DatabaseModule = class DatabaseModule {
};
DatabaseModule = __decorate([
    Module({
        providers: [
            DatabaseService,
            {
                provide: DataSource,
                inject: [DatabaseService],
                useFactory: (database) => database.dataSource,
            },
        ],
        controllers: [DatabaseHealthController],
        exports: [DatabaseService, DataSource],
    })
], DatabaseModule);
export { DatabaseModule };
//# sourceMappingURL=database.module.js.map