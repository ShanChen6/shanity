import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CurriculumChangedInterceptor } from './curriculum-changed.interceptor.js';
import { CurriculumEvents } from './curriculum-events.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [CurriculumEvents, CurriculumChangedInterceptor],
  exports: [CurriculumEvents, CurriculumChangedInterceptor, DatabaseModule],
})
export class CurriculumEventsModule {}
