import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import {
  CourseOwnershipGuard,
  RequireCourseOwnership,
} from '../../courses/course-ownership.guard.js';
import { CreateLessonDto, UpdateLessonDto } from './dto/lessons.dto.js';
import { LessonsService } from './lessons.service.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@Controller()
@UseGuards(OriginGuard, SessionGuard, CourseOwnershipGuard)
@Roles('instructor', 'admin')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Post('chapters/:chapterId/lessons')
  @RequireCourseOwnership({ resource: 'chapter', param: 'chapterId' })
  @Header('Cache-Control', 'no-store')
  create(
    @Param('chapterId', uuid()) chapterId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.lessons.create(chapterId, dto);
  }

  @Get('chapters/:chapterId/lessons')
  @RequireCourseOwnership({ resource: 'chapter', param: 'chapterId' })
  @Header('Cache-Control', 'no-store')
  list(@Param('chapterId', uuid()) chapterId: string) {
    return this.lessons.list(chapterId);
  }

  @Get('lessons/:id')
  @RequireCourseOwnership({ resource: 'lesson', param: 'id' })
  @Header('Cache-Control', 'no-store')
  get(@Param('id', uuid()) id: string) {
    return this.lessons.get(id);
  }

  @Patch('lessons/:id')
  @RequireCourseOwnership({ resource: 'lesson', param: 'id' })
  @Header('Cache-Control', 'no-store')
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateLessonDto) {
    return this.lessons.update(id, dto);
  }

  @Delete('lessons/:id')
  @RequireCourseOwnership({ resource: 'lesson', param: 'id' })
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  remove(@Param('id', uuid()) id: string) {
    return this.lessons.remove(id);
  }
}
