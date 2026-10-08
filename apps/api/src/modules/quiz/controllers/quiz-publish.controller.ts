import {
  Controller,
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
import { QuizPublishService } from '../services/quiz-publish.service.js';

// The body is never read: what gets published is decided by the attempt's own
// state (GRADED), not by anything the client sends. The service proves the
// caller manages the course (the E11 rule) before touching a row.
@Controller('instructor')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class QuizPublishController {
  constructor(private readonly publishing: QuizPublishService) {}

  @Post('quiz-attempts/:attemptId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  publishOne(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.publishing.publishSingleAttempt(req.principal, attemptId);
  }

  @Post('quizzes/:quizId/publish-results')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  publishAll(
    @Req() req: AuthRequest,
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
  ) {
    return this.publishing.publishBatchQuizAttempts(req.principal, quizId);
  }
}
