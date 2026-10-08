import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CACHE_CONFIG, PUBLIC_CATALOG_GROUP } from '../cache/cache.module.js';
import type { CacheConfig } from '../cache/cache.config.js';
import { CacheService } from '../cache/cache.service.js';
import { CurriculumChangedInterceptor } from '../modules/curriculum/curriculum-changed.interceptor.js';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.guards.js';
import {
  CourseOwnershipGuard,
  RequireCourseOwnership,
} from './course-ownership.guard.js';
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
  get(@Req() req: AuthRequest & { course: Course }) {
    return req.course;
  }

  @Post(':courseId/enroll')
  @Roles('student')
  @Header('Cache-Control', 'no-store')
  enroll(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ) {
    return this.courses.enroll(req.principal.id, courseId);
  }

  @Get(':courseId/enrollment-status')
  @Roles('student')
  @Header('Cache-Control', 'no-store')
  enrollmentStatus(
    @Req() req: AuthRequest,
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
  ) {
    return this.courses.enrollmentStatus(req.principal.id, courseId);
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
    return this.courses.update(req.course, dto, req.principal.id);
  }

  @Post(':id/publish')
  @UseInterceptors(CurriculumChangedInterceptor)
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  publish(@Param('id') id: string) {
    return this.courses.publish(id);
  }

  @Post(':id/unpublish')
  @UseInterceptors(CurriculumChangedInterceptor)
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  unpublish(@Param('id') id: string) {
    return this.courses.unpublish(id);
  }

  @Post(':id/archive')
  @UseInterceptors(CurriculumChangedInterceptor)
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
  constructor(
    private readonly courses: CoursesService,
    private readonly cache: CacheService,
    @Inject(CACHE_CONFIG) private readonly config: CacheConfig,
  ) {}

  private cached<T>(key: string, load: () => Promise<T>) {
    return this.cache.remember(
      PUBLIC_CATALOG_GROUP,
      key,
      this.config.publicCatalogTtlSeconds,
      load,
    );
  }

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  list(@Query() query: PublicCourseQueryDto) {
    // Free-text searches are unbounded in variety, so only the browse views
    // (which the whole audience shares) are cached.
    if (query.search) return this.courses.listPublic(query);
    const { page, limit, instructorId, sortBy, sortOrder } = query;
    return this.cached(
      `list:${page}:${limit}:${instructorId ?? ''}:${sortBy}:${sortOrder}`,
      () => this.courses.listPublic(query),
    );
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=60')
  detail(@Param('slug') slug: string) {
    return this.cached(`detail:${slug}`, () =>
      this.courses.getPublicBySlug(slug),
    );
  }

  @Get(':slug/syllabus')
  @Header('Cache-Control', 'public, max-age=60')
  syllabus(@Param('slug') slug: string) {
    return this.cached(`syllabus:${slug}`, () =>
      this.courses.getPublicSyllabus(slug),
    );
  }
}
