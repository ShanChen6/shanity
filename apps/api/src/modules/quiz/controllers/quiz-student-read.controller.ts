import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../../../auth/auth.guards.js';
import { CourseEnrollmentGuard } from '../../../courses/course-enrollment.guard.js';
import {
  ListMyAttemptsQueryDto,
  ListStandaloneQuizzesQueryDto,
} from '../dto/student-quiz.dto.js';
import { QuizStudentReadService } from '../services/quiz-student-read.service.js';

/**
 * Student discovery: quiz overviews before an attempt starts. Never returns
 * questions, options or answer keys; questions are served from an attempt's
 * snapshot once started. Registered before the `quizzes/:id/...` routes so
 * the literal `standalone` segment always wins.
 */
@Controller()
@UseGuards(SessionGuard)
export class QuizStudentReadController {
  constructor(private readonly reads: QuizStudentReadService) {}

  @Get('quizzes/standalone')
  @Header('Cache-Control', 'private, no-store')
  listStandalone(@Query() query: ListStandaloneQuizzesQueryDto) {
    return this.reads.listStandalone(query);
  }

  @Get('quizzes/standalone/:slug')
  @Header('Cache-Control', 'private, no-store')
  standalone(@Req() req: AuthRequest, @Param('slug') slug: string) {
    return this.reads.standaloneBySlug(req.principal, slug);
  }

  @Get('courses/:courseId/quizzes')
  @UseGuards(CourseEnrollmentGuard)
  @Header('Cache-Control', 'private, no-store')
  listForCourse(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.reads.listForCourse(req.principal, courseId);
  }

  // Every scope; the learner's own attempts only.
  @Get('my-quiz-attempts')
  @Header('Cache-Control', 'private, no-store')
  myAttempts(@Req() req: AuthRequest, @Query() query: ListMyAttemptsQueryDto) {
    return this.reads.myAttempts(req.principal, query);
  }
}
