import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import { GradeQuizAttemptDto } from '../dto/grade-attempt.dto.js';
import { QuizGradingService } from '../services/quiz-grading.service.js';

// SessionGuard enforces the role; the service then proves the caller manages
// the attempt's course (the same rule as the E11 grading queue) before any
// read or write.
@Controller('instructor/quiz-attempts')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class QuizGradingController {
  constructor(private readonly grading: QuizGradingService) {}

  @Get(':attemptId')
  @Header('Cache-Control', 'private, no-store')
  attempt(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.grading.getAttempt(req.principal, attemptId);
  }

  @Post(':attemptId/grade')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  grade(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: GradeQuizAttemptDto,
  ) {
    return this.grading.grade(req.principal, attemptId, body);
  }
}
