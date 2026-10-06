import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../../auth/auth.guards.js';
import {
  CreateOptionDto,
  CreateQuestionDto,
  ReorderOptionsDto,
  ReorderQuestionsDto,
  UpdateOptionDto,
  UpdateQuestionDto,
} from '../dto/quiz-question-authoring.dto.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import { QuizQuestionAuthoringService } from '../services/quiz-question-authoring.service.js';

const uuid = () => new ParseUUIDPipe();

// SessionGuard enforces @Roles (403 FORBIDDEN_RESOURCE); QuizAuthorizationGuard
// resolves the quiz from :quizId, :questionId or :optionId and settles course
// or authorship authority. The service then checks parent/child consistency
// (404) and DRAFT state (409 QUIZ_NOT_EDITABLE).
@Controller('admin')
@UseGuards(OriginGuard, SessionGuard, QuizAuthorizationGuard)
@Roles('instructor', 'admin')
@UseInterceptors(ClassSerializerInterceptor)
export class QuizQuestionAuthoringController {
  constructor(private readonly authoring: QuizQuestionAuthoringService) {}

  @Post('quizzes/:quizId/questions')
  @Header('Cache-Control', 'private, no-store')
  createQuestion(
    @Param('quizId', uuid()) quizId: string,
    @Body() body: CreateQuestionDto,
  ) {
    return this.authoring.createQuestion(quizId, body);
  }

  @Patch('quizzes/:quizId/questions/reorder')
  @Header('Cache-Control', 'private, no-store')
  reorderQuestions(
    @Param('quizId', uuid()) quizId: string,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.authoring.reorderQuestions(quizId, body);
  }

  @Put('quizzes/:quizId/questions/:questionId')
  @Header('Cache-Control', 'private, no-store')
  updateQuestion(
    @Param('quizId', uuid()) quizId: string,
    @Param('questionId', uuid()) questionId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.authoring.updateQuestion(quizId, questionId, body);
  }

  @Delete('quizzes/:quizId/questions/:questionId')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  deleteQuestion(
    @Param('quizId', uuid()) quizId: string,
    @Param('questionId', uuid()) questionId: string,
  ) {
    return this.authoring.deleteQuestion(quizId, questionId);
  }

  @Post('questions/:questionId/options')
  @Header('Cache-Control', 'private, no-store')
  createOption(
    @Param('questionId', uuid()) questionId: string,
    @Body() body: CreateOptionDto,
  ) {
    return this.authoring.createOption(questionId, body);
  }

  @Patch('questions/:questionId/options/reorder')
  @Header('Cache-Control', 'private, no-store')
  reorderOptions(
    @Param('questionId', uuid()) questionId: string,
    @Body() body: ReorderOptionsDto,
  ) {
    return this.authoring.reorderOptions(questionId, body);
  }

  @Put('options/:optionId')
  @Header('Cache-Control', 'private, no-store')
  updateOption(
    @Param('optionId', uuid()) optionId: string,
    @Body() body: UpdateOptionDto,
  ) {
    return this.authoring.updateOption(optionId, body);
  }

  @Delete('options/:optionId')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  deleteOption(@Param('optionId', uuid()) optionId: string) {
    return this.authoring.deleteOption(optionId);
  }
}
