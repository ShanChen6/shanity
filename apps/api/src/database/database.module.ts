import { Controller, Get, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import knex, { type Knex } from 'knex';
import { databaseConfig } from './config.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly client: Knex = knex(databaseConfig());

  async onModuleInit() {
    try {
      await this.client.raw('SELECT 1');
    } catch {
      await this.client.destroy();
      throw new Error('PostgreSQL unavailable; check database configuration and readiness');
    }
  }

  async onApplicationShutdown() { await this.client.destroy(); }
}

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('db')
  async check() {
    try {
      await this.database.client.raw('SELECT 1').timeout(5000);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}

@Module({ providers: [DatabaseService], controllers: [DatabaseHealthController], exports: [DatabaseService] })
export class DatabaseModule {}
