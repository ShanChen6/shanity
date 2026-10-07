import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../../auth/auth.guards.js';
import {
  CreateQuizDto,
  ListQuizzesQueryDto,
  UpdateQuizDto,
} from '../dto/quiz-authoring.dto.js';
import {
  QuizAuthorizationGuard,
  type QuizAuthorizationRequest,
} from '../guards/quiz-authorization.guard.js';
import { QuizAuthoringService } from '../services/quiz-authoring.service.js';
import { QuizPublishingService } from '../services/quiz-publishing.service.js';

// SessionGuard enforces @Roles; per-quiz routes then pass
// QuizAuthorizationGuard (course instructors, standalone author, admins).
@Controller('admin/quizzes')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
@UseInterceptors(ClassSerializerInterceptor)
export class QuizAuthoringController {
  constructor(
    private readonly authoring: QuizAuthoringService,
    private readonly publishing: QuizPublishingService,
  ) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(@Req() req: AuthRequest, @Body() body: CreateQuizDto) {
    return this.authoring.create(req.principal, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthRequest, @Query() query: ListQuizzesQueryDto) {
    return this.authoring.list(req.principal, query);
  }

  @Get(':id')
  @UseGuards(QuizAuthorizationGuard)
  @Header('Cache-Control', 'private, no-store')
  detail(@Req() req: QuizAuthorizationRequest) {
    return this.authoring.detail(req.quiz!.id, req.quiz!.courseId);
  }

  @Put(':id')
  @UseGuards(QuizAuthorizationGuard)
  @Header('Cache-Control', 'private, no-store')
  update(@Req() req: QuizAuthorizationRequest, @Body() body: UpdateQuizDto) {
    return this.authoring.update(req.quiz!.id, req.quiz!.courseId, body);
  }

  // The only way into PUBLISHED: CRUD DTOs do not even declare `status`.
  @Post(':id/publish')
  @UseGuards(QuizAuthorizationGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  publish(@Req() req: QuizAuthorizationRequest) {
    return this.publishing.publish(req.quiz!.id, req.quiz!.courseId);
  }

  // Reopens a PUBLISHED quiz as the next version's DRAFT.
  @Post(':id/versions')
  @UseGuards(QuizAuthorizationGuard)
  @Header('Cache-Control', 'private, no-store')
  openNewVersion(@Req() req: QuizAuthorizationRequest) {
    return this.publishing.openNewVersion(req.quiz!.id, req.quiz!.courseId);
  }

  @Delete(':id')
  @UseGuards(QuizAuthorizationGuard)
  @HttpCode(200)
  remove(@Req() req: QuizAuthorizationRequest) {
    return this.authoring.remove(req.quiz!.id, req.quiz!.courseId);
  }
}
