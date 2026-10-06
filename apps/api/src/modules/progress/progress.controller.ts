import {
  Body,
  Controller,
  Get,
  Header,
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
import { CourseProgressEngine } from './services/course-progress-engine.service.js';

@Controller()
@UseGuards(OriginGuard, SessionGuard)
@Roles('student')
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly courseProgressEngine: CourseProgressEngine,
  ) {}

  @Get('student/enrolled-courses')
  @Header('Cache-Control', 'no-store')
  enrolledCourses(@Req() req: AuthRequest) {
    return this.courseProgressEngine.enrolledCourses(req.principal.id);
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
  @Header('Cache-Control', 'no-store')
  video(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.progress.videoProgress(req.principal.id, id, dto);
  }
}
