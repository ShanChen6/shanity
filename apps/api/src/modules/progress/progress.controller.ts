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
import { ProgressService } from './progress.service.js';

@Controller()
@UseGuards(OriginGuard, SessionGuard)
@Roles('student')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('courses/:courseId/progress')
  @Header('Cache-Control', 'no-store')
  course(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ) {
    return this.progress.courseProgress(req.principal.id, courseId);
  }

  @Post('lessons/:id/progress/start')
  @Header('Cache-Control', 'no-store')
  start(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.progress.start(req.principal.id, id);
  }

  @Post(['lessons/:id/progress/complete', 'lessons/:id/complete'])
  @Header('Cache-Control', 'no-store')
  complete(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progress.complete(req.principal.id, id, dto);
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
