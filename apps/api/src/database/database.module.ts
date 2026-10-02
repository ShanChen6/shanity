import {
  Controller,
  Get,
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAppDataSource } from './typeorm.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly dataSource = createAppDataSource();

  async onModuleInit() {
    try {
      await this.dataSource.initialize();
    } catch {
      if (this.dataSource.isInitialized) await this.dataSource.destroy();
      throw new Error(
        'PostgreSQL unavailable; check database configuration and readiness',
      );
    }
  }

  async onApplicationShutdown() {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('db')
  async check() {
    try {
      await this.database.dataSource.transaction(async (manager) => {
        await manager.query("SET LOCAL statement_timeout = '5s'");
        await manager.query('SELECT 1');
      });
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}

@Module({
  providers: [
    DatabaseService,
    {
      provide: DataSource,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => database.dataSource,
    },
  ],
  controllers: [DatabaseHealthController],
  exports: [DatabaseService, DataSource],
})
export class DatabaseModule {}
