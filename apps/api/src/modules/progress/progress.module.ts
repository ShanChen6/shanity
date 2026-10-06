import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProgressController],
  providers: [ProgressService, OriginGuard, SessionGuard],
  exports: [ProgressService],
})
export class ProgressModule {}
