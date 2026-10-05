import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../auth/auth.guards.js';
import {
  CourseOwnershipGuard,
  RequireCourseOwnership,
} from './course-ownership.guard.js';
import { Course } from './course.entity.js';
import { normalizeAvatar, MAX_AVATAR_BYTES } from '../avatar/avatar.service.js';
import type {
  CreateLessonDto,
  LessonContentDto,
  UpdateLessonDto,
} from '../modules/lessons/dto/lessons.dto.js';
import {
  Lesson,
  LessonType,
} from '../modules/lessons/entities/lesson.entity.js';
import { LessonsService } from '../modules/lessons/lessons.service.js';

class LessonDto {
  @IsString() @Length(1, 255) @Matches(/\S/) title!: string;
  @IsIn(['Article', 'Video', 'Quiz', 'TEXT', 'VIDEO', 'DOCUMENT'])
  type!: string;
  @IsOptional() @IsString() @Length(0, 100000) body?: string;
  @IsOptional() @IsString() @Matches(/^https?:\/\/[^\s]+$/) videoUrl?: string;
  @IsOptional() @IsBoolean() isPreview?: boolean;
}
class LessonOrderDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids!: string[];
}
type OwnedRequest = AuthRequest & { course: Course };
const fields = `id, chapter_id AS "chapterId", title,
   CASE type
     WHEN 'TEXT' THEN 'Article'
     WHEN 'VIDEO' THEN 'Video'
     WHEN 'DOCUMENT' THEN 'Quiz'
   END AS type,
   type AS "contentType",
   COALESCE(text_body, '') AS body,
   video_external_url AS "videoUrl",
   video_asset_id AS "videoAssetId",
   document_asset_id AS "documentAssetId",
   is_preview AS "isPreview", position`;

function legacyLesson(lesson: Lesson) {
  return {
    id: lesson.id,
    chapterId: lesson.chapterId,
    title: lesson.title,
    type:
      lesson.type === LessonType.TEXT
        ? 'Article'
        : lesson.type === LessonType.VIDEO
          ? 'Video'
          : 'Quiz',
    contentType: lesson.type,
    body: lesson.textBody ?? '',
    videoUrl: lesson.videoExternalUrl,
    videoAssetId: lesson.videoAssetId,
    documentAssetId: lesson.documentAssetId,
    isPreview: lesson.isPreview,
    position: lesson.position,
  };
}

function lessonType(value: string): LessonType {
  if (value === 'Article' || value === 'Quiz' || value === LessonType.TEXT)
    return LessonType.TEXT;
  if (value === 'Video' || value === LessonType.VIDEO) return LessonType.VIDEO;
  return LessonType.DOCUMENT;
}

function lessonContent(dto: LessonDto): LessonContentDto {
  const type = lessonType(dto.type);
  if (type === LessonType.TEXT) return { textBody: dto.body ?? '' };
  if (type === LessonType.VIDEO) return { videoUrl: dto.videoUrl };
  throw new BadRequestException(
    'Use the Lesson API content object when creating a DOCUMENT lesson',
  );
}

@Controller('courses/:courseId')
@UseGuards(OriginGuard, SessionGuard, CourseOwnershipGuard)
@Roles('instructor', 'admin')
@RequireCourseOwnership({ resource: 'course', param: 'courseId' })
export class InstructorContentController {
  constructor(
    private readonly database: DataSource,
    private readonly lessons: LessonsService,
  ) {}

  private async assertLessonInCourse(courseId: string, lessonId: string) {
    const [lesson] = await this.database.query(
      'SELECT id FROM lessons WHERE id = $1 AND course_id = $2 AND chapter_id IS NOT NULL',
      [lessonId, courseId],
    );
    if (!lesson) throw new NotFoundException('Lesson not found');
  }

  private async assertChapterInCourse(courseId: string, chapterId: string) {
    const [chapter] = await this.database.query(
      'SELECT id FROM chapters WHERE id = $1 AND course_id = $2',
      [chapterId, courseId],
    );
    if (!chapter) throw new NotFoundException('Chapter not found');
  }

  private async chapter(
    manager: EntityManager,
    courseId: string,
    chapterId: string,
  ) {
    await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
      courseId,
    ]);
    const rows = await manager.query(
      'SELECT id FROM chapters WHERE id = $1 AND course_id = $2',
      [chapterId, courseId],
    );
    if (!rows.length) throw new NotFoundException('Chapter not found');
  }

  @Header('Cache-Control', 'no-store')
  @Get('lessons')
  list(@Req() req: OwnedRequest) {
    return this.database.query(
      `SELECT ${fields} FROM lessons WHERE course_id = $1 AND chapter_id IS NOT NULL ORDER BY position, id`,
      [req.course.id],
    );
  }

  @Post('chapters/:chapterId/lessons')
  async create(
    @Req() req: OwnedRequest,
    @Param('chapterId', new ParseUUIDPipe({ version: '4' })) chapterId: string,
    @Body() dto: LessonDto,
  ) {
    await this.assertChapterInCourse(req.course.id, chapterId);
    const input: CreateLessonDto = {
      title: dto.title,
      type: lessonType(dto.type),
      isPreview: dto.isPreview,
      content: lessonContent(dto),
    };
    return legacyLesson(await this.lessons.create(chapterId, input));
  }

  @Patch('chapters/:chapterId/lessons/reorder')
  reorder(
    @Req() req: OwnedRequest,
    @Param('chapterId', new ParseUUIDPipe({ version: '4' })) chapterId: string,
    @Body() dto: LessonOrderDto,
  ) {
    return this.database.transaction(async (manager) => {
      await this.chapter(manager, req.course.id, chapterId);
      const rows: { id: string }[] = await manager.query(
        'SELECT id FROM lessons WHERE chapter_id = $1',
        [chapterId],
      );
      if (
        rows.length !== dto.ids.length ||
        rows.some((row) => !dto.ids.includes(row.id))
      )
        throw new BadRequestException(
          'Include every lesson in this chapter exactly once',
        );
      for (const [position, id] of dto.ids.entries())
        await manager.query(
          'UPDATE lessons SET position = $1 WHERE id = $2 AND chapter_id = $3',
          [position, id, chapterId],
        );
      return manager.query(
        `SELECT ${fields} FROM lessons WHERE course_id = $1 AND chapter_id IS NOT NULL ORDER BY position, id`,
        [req.course.id],
      );
    });
  }

  @Patch('lessons/:id')
  async update(
    @Req() req: OwnedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LessonDto,
  ) {
    await this.assertLessonInCourse(req.course.id, id);
    const input: UpdateLessonDto = {
      title: dto.title,
      type: lessonType(dto.type),
      isPreview: dto.isPreview,
      content: lessonContent(dto),
    };
    return legacyLesson(await this.lessons.update(id, input));
  }

  @Delete('lessons/:id')
  @HttpCode(204)
  async remove(
    @Req() req: OwnedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.assertLessonInCourse(req.course.id, id);
    await this.lessons.remove(id);
  }

  @Post('thumbnail')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
    }),
  )
  async upload(
    @Req() req: OwnedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data = await normalizeAvatar(file);
    const [media] = await this.database.query(
      'INSERT INTO course_media(course_id, data) VALUES ($1, $2) RETURNING id',
      [req.course.id, data],
    );
    return { url: `/course-media/${media.id}` };
  }
}

@Controller('course-media')
export class CourseMediaController {
  constructor(private readonly database: DataSource) {}
  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async read(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const [media] = await this.database.query(
      'SELECT data FROM course_media WHERE id = $1',
      [id],
    );
    if (!media) throw new NotFoundException();
    return new StreamableFile(media.data, {
      type: 'image/webp',
      disposition: 'inline',
    });
  }
}
