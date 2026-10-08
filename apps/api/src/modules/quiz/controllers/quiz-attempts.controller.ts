import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
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
import {
  SaveAttemptAnswerDto,
  SaveDraftAnswerDto,
  SubmitQuizDto,
} from '../dto/quiz-attempt.dto.js';
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

  @Patch('quiz-attempts/:attemptId/answers/draft')
  @Header('Cache-Control', 'private, no-store')
  saveDraft(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: SaveDraftAnswerDto,
  ) {
    return this.attempts.saveDraft(req.principal, attemptId, body);
  }

  @Post('quiz-attempts/:attemptId/attachments/signature')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  attachmentSignature(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.attempts.attachmentUploadSignature(req.principal, attemptId);
  }

  @Get('quiz-attempts/:attemptId')
  @Header('Cache-Control', 'private, no-store')
  attempt(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.attempts.getAttempt(req.principal, attemptId);
  }

  // Score always; answer key and explanations only as the review policy allows.
  // `student-result` is the same learner view under its E14 name.
  @Get([
    'quiz-attempts/:attemptId/result',
    'quiz-attempts/:attemptId/student-result',
  ])
  @Header('Cache-Control', 'private, no-store')
  result(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.attempts.result(req.principal, attemptId);
  }

  @Post('quiz-attempts/:attemptId/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  submit(
    @Req() req: AuthRequest,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: SubmitQuizDto,
  ) {
    return this.attempts.submit(req.principal, attemptId, body);
  }
}
