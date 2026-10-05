import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.guards.js';
import {
  CourseOwnershipGuard,
  RequireCourseOwnership,
} from './course-ownership.guard.js';
import type { Course } from './course.entity.js';
import {
  CreateChapterDto,
  ReorderChaptersDto,
  UpdateChapterDto,
} from './chapters.dto.js';
import { ChaptersService } from './chapters.service.js';

type CourseRequest = AuthRequest & { course: Course };

@Controller()
@UseGuards(OriginGuard, SessionGuard)
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Post('courses/:courseId/chapters')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'courseId' })
  @Header('Cache-Control', 'no-store')
  create(@Req() req: CourseRequest, @Body() dto: CreateChapterDto) {
    return this.chapters.create(req.course.id, dto);
  }

  @Get('courses/:courseId/chapters')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'courseId' })
  @Header('Cache-Control', 'no-store')
  list(@Req() req: CourseRequest) {
    return this.chapters.list(req.course.id);
  }

  @Patch('courses/:courseId/chapters/reorder')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'courseId' })
  @Header('Cache-Control', 'no-store')
  reorder(@Req() req: CourseRequest, @Body() dto: ReorderChaptersDto) {
    return this.chapters.reorder(req.course.id, dto);
  }

  @Patch('chapters/:id')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'chapter', param: 'id' })
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.chapters.update(id, dto);
  }

  @Delete('chapters/:id')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'chapter', param: 'id' })
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  remove(@Param('id') id: string) {
    return this.chapters.remove(id);
  }
}