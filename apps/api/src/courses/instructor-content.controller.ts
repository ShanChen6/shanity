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

class LessonDto {
  @IsString() @Length(1, 255) @Matches(/\S/) title!: string;
  @IsIn(['Article', 'Video', 'Quiz']) type!: string;
  @IsOptional() @IsString() @Length(0, 100000) body?: string;
  @IsOptional() @IsString() @Matches(/^https?:\/\/[^\s]+$/) videoUrl?: string;
}
class LessonOrderDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) ids!: string[];
}
type OwnedRequest = AuthRequest & { course: Course };
const fields =
  'id, chapter_id AS "chapterId", title, type, body, video_storage_key AS "videoUrl", position';

@Controller('courses/:courseId')
@UseGuards(OriginGuard, SessionGuard, CourseOwnershipGuard)
@Roles('instructor', 'admin')
@RequireCourseOwnership({ resource: 'course', param: 'courseId' })
export class InstructorContentController {
  constructor(private readonly database: DataSource) {}

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
  create(
    @Req() req: OwnedRequest,
    @Param('chapterId', new ParseUUIDPipe({ version: '4' })) chapterId: string,
    @Body() dto: LessonDto,
  ) {
    return this.database.transaction(async (manager) => {
      await this.chapter(manager, req.course.id, chapterId);
      const [lesson] = await manager.query(
        `INSERT INTO lessons(course_id, chapter_id, title, type, body, video_storage_key, position)
        SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(position), -1) + 1 FROM lessons WHERE chapter_id = $2 RETURNING ${fields}`,
        [
          req.course.id,
          chapterId,
          dto.title.trim(),
          dto.type,
          dto.body ?? '',
          dto.videoUrl ?? null,
        ],
      );
      return lesson;
    });
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
  update(
    @Req() req: OwnedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LessonDto,
  ) {
    return this.database.transaction(async (manager) => {
      await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
        req.course.id,
      ]);
      const [lesson] = await manager.query(
        `UPDATE lessons SET title = $1, type = $2, body = $3, video_storage_key = $4 WHERE id = $5 AND course_id = $6 AND chapter_id IS NOT NULL RETURNING ${fields}`,
        [
          dto.title.trim(),
          dto.type,
          dto.body ?? '',
          dto.videoUrl ?? null,
          id,
          req.course.id,
        ],
      );
      if (!lesson) throw new NotFoundException('Lesson not found');
      return lesson;
    });
  }

  @Delete('lessons/:id')
  @HttpCode(204)
  remove(
    @Req() req: OwnedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.database.transaction(async (manager) => {
      await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
        req.course.id,
      ]);
      const rows = await manager.query(
        'DELETE FROM lessons WHERE id = $1 AND course_id = $2 AND chapter_id IS NOT NULL RETURNING id',
        [id, req.course.id],
      );
      // TypeORM returns [rows, affected] for raw DELETE.
      if (!rows[1]) throw new NotFoundException('Lesson not found');
    });
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
