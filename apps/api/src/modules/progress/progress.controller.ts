import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import { ProgressService } from './progress.service.js';
import { LessonAccessGuard } from '../lessons/guards/lesson-access.guard.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { ResumeLearningService } from './services/resume-learning.service.js';
import type { EnrolledCourseDto } from './dto/enrolled-course.dto.js';

@Controller()
@UseGuards(OriginGuard, SessionGuard)
@Roles('student')
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly progressCalculator: CourseProgressCalculatorService,
    private readonly resumeLearning: ResumeLearningService,
  ) {}

  @Get('student/resume-course')
  @Header('Cache-Control', 'no-store')
  resumeCourse(@Req() req: AuthRequest) {
    return this.resumeLearning.latest(req.principal.id);
  }

  @Get('courses/:courseId/resume-lesson')
  @Header('Cache-Control', 'no-store')
  resumeLesson(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ) {
    return this.resumeLearning.course(req.principal.id, courseId);
  }

  @Get('student/enrolled-courses')
  @Header('Cache-Control', 'no-store')
  enrolledCourses(@Req() req: AuthRequest): Promise<EnrolledCourseDto[]> {
    return this.progressCalculator.enrolledCourses(req.principal.id);
  }

  @Get('courses/:courseId/progress')
  @Header('Cache-Control', 'no-store')
  course(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ) {
    return this.progress.courseProgress(req.principal.id, courseId);
  }

  @Post('lessons/:lessonId/progress/start')
  @UseGuards(LessonAccessGuard)
  @Header('Cache-Control', 'no-store')
  start(
    @Req() req: AuthRequest,
    @Param('lessonId', new ParseUUIDPipe({ version: '4' })) lessonId: string,
  ) {
    return this.progress.startLesson(req.principal.id, lessonId);
  }

  @Patch('lessons/:lessonId/progress/heartbeat')
  @UseGuards(LessonAccessGuard)
  @Header('Cache-Control', 'no-store')
  heartbeat(
    @Req() req: AuthRequest,
    @Param('lessonId', new ParseUUIDPipe({ version: '4' })) lessonId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progress.updateHeartbeat(req.principal.id, lessonId, dto);
  }

  @Post(['lessons/:lessonId/progress/complete', 'lessons/:lessonId/complete'])
  // Idempotent: completing twice (double-click, retries, parallel tabs) is
  // the same 200 with the same single lesson_progress row.
  @HttpCode(200)
  @UseGuards(LessonAccessGuard)
  @Header('Cache-Control', 'no-store')
  complete(
    @Req() req: AuthRequest,
    @Param('lessonId', new ParseUUIDPipe({ version: '4' })) lessonId: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progress.completeLesson(req.principal.id, lessonId, dto);
  }

  @Patch('lessons/:id/video-progress')
  @UseGuards(LessonAccessGuard)
  @Header('Cache-Control', 'no-store')
  video(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.progress.videoProgress(req.principal.id, id, dto);
  }
}
