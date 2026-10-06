import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { LessonAccessGuard } from './guards/lesson-access.guard.js';
import { LessonAccessService } from './lesson-access.service.js';

@Controller('lessons')
@UseGuards(LessonAccessGuard)
export class LessonAccessController {
  constructor(private readonly lessons: LessonAccessService) {}

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.lessons.getAccessible(id);
  }
}
