import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  OriginGuard,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import { SaveAttemptAnswerDto } from '../dto/quiz-attempt.dto.js';
import { QuizAttemptsService } from '../services/quiz-attempts.service.js';

@Controller()
@UseGuards(OriginGuard, SessionGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class QuizAttemptsController {
  constructor(private readonly attempts: QuizAttemptsService) {}

  // 201 for a new attempt, 200 when the running one is resumed.
  @Post('quizzes/:id/attempts')
  @Header('Cache-Control', 'private, no-store')
  async start(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, attempt } = await this.attempts.start(req.principal, id);
    res.status(created ? 201 : 200);
    return attempt;
  }

  @Get('quizzes/:id/active-attempt')
  @Header('Cache-Control', 'private, no-store')
  active(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.attempts.activeAttempt(req.principal, id);
  }

  @Put('quiz-attempts/:attemptId/answers')
  @Header('Cache-Control', 'private, no-store')
  saveAnswer(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: SaveAttemptAnswerDto,
  ) {
    return this.attempts.saveAnswer(req.principal, attemptId, body);
  }

  @Post('quiz-attempts/:attemptId/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  submit(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.attempts.submit(req.principal, attemptId);
  }
}
