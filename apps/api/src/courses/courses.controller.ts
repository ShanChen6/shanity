import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.guards.js';
import { CourseOwnershipGuard, RequireCourseOwnership } from './course-ownership.guard.js';
import { Course } from './course.entity.js';
import { CreateCourseDto, UpdateCourseDto } from './courses.dto.js';
import { PublicCourseQueryDto } from './public-courses.dto.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
@UseGuards(OriginGuard, SessionGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @Roles('instructor', 'admin')
  @Header('Cache-Control', 'no-store')
  create(@Req() req: AuthRequest, @Body() dto: CreateCourseDto) {
    return this.courses.create(req.principal, dto);
  }

  @Get()
  @Roles('student', 'instructor', 'admin')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest) {
    return this.courses.list(req.principal);
  }

  @Get(':id')
  @Roles('student', 'instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  get(
    @Req() req: AuthRequest & { course: Course },
  ) {
    return req.course;
  }

  @Patch(':id')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  update(
    @Req() req: AuthRequest & { course: Course },
    @Param('id') _id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(req.course, dto);
  }

  @Post(':id/publish')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  publish(@Param('id') id: string) {
    return this.courses.publish(id);
  }

  @Post(':id/archive')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  archive(@Param('id') id: string) {
    return this.courses.archive(id);
  }
}

@Controller('public/courses')
export class PublicCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  list(@Query() query: PublicCourseQueryDto) {
    return this.courses.listPublic(query);
  }
}