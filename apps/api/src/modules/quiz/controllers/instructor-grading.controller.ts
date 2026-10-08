import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import {
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import { GradingQueueQueryDto } from '../dto/grading-queue.dto.js';
import { InstructorGradingQueueService } from '../services/instructor-grading-queue.service.js';

// SessionGuard enforces the role; the service scopes every row to the
// courses the caller teaches (admins: all).
@Controller('instructor/grading-queue')
@UseGuards(SessionGuard)
@Roles('instructor', 'admin')
export class InstructorGradingController {
  constructor(private readonly queue: InstructorGradingQueueService) {}

  @Get('courses')
  @Header('Cache-Control', 'private, no-store')
  courses(@Req() req: AuthRequest) {
    return this.queue.courses(req.principal);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthRequest, @Query() query: GradingQueueQueryDto) {
    return this.queue.list(req.principal, query);
  }
}
