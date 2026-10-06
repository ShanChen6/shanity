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
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import type { AuthRequest } from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { ProgressService } from './progress.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@Controller('api/v1')
@UseGuards(OriginGuard, SessionGuard)
@Roles('student')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('courses/:courseId/progress')
  @Header('Cache-Control', 'no-store')
  courseProgress(
    @Req() req: AuthRequest,
    @Param('courseId', uuid()) courseId: string,
  ) {
    return this.progress.courseProgress(req.principal.id, courseId);
  }

  @Post('lessons/:id/progress/start')
  @Header('Cache-Control', 'no-store')
  start(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.progress.start(req.principal.id, id);
  }

  @Post('lessons/:id/progress/complete')
  @Header('Cache-Control', 'no-store')
  complete(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progress.complete(req.principal.id, id, dto);
  }

  // Compatibility with the shorter endpoint named in the lesson UI contract.
  @Post('lessons/:id/complete')
  @Header('Cache-Control', 'no-store')
  completeAlias(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progress.complete(req.principal.id, id, dto);
  }

  @Patch('lessons/:id/video-progress')
  @Header('Cache-Control', 'no-store')
  videoProgress(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.progress.videoProgress(req.principal.id, id, dto);
  }
}
