import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import {
  CourseLiveSessionsController,
  LiveSessionsController,
} from './live-sessions.controller.js';
import { HeartbeatThrottleGuard } from './heartbeat-throttle.guard.js';
import { LiveAttendanceService } from './live-attendance.service.js';
import { LiveSessionsService } from './live-sessions.service.js';

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [CourseLiveSessionsController, LiveSessionsController],
  providers: [
    LiveSessionsService,
    LiveAttendanceService,
    HeartbeatThrottleGuard,
  ],
})
export class LiveSessionModule {}
