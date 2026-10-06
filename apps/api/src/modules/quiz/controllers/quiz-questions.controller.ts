import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import {
  QuizAuthorizationGuard,
  type QuizAuthorizationRequest,
} from '../guards/quiz-authorization.guard.js';
import { QuizQuestionsService } from '../services/quiz-questions.service.js';

// ClassSerializerInterceptor honours @Exclude on the entities as a backstop
// should an entity ever be returned directly.
@Controller('quizzes')
@UseGuards(SessionGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class QuizTakeController {
  constructor(private readonly questions: QuizQuestionsService) {}

  @Get(':id/take')
  @Header('Cache-Control', 'private, no-store')
  take(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.questions.getForLearner(req.principal, id);
  }
}

// SessionGuard enforces @Roles; QuizAuthorizationGuard then limits
// instructors to quizzes of courses they teach (admins see all).
@Controller('admin/quizzes/:id')
@UseGuards(SessionGuard, QuizAuthorizationGuard)
@Roles('instructor', 'admin')
@UseInterceptors(ClassSerializerInterceptor)
export class AdminQuizQuestionsController {
  constructor(private readonly questions: QuizQuestionsService) {}

  @Get('questions')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: QuizAuthorizationRequest) {
    return this.questions.listForInstructor(req.quiz!.id);
  }
}
