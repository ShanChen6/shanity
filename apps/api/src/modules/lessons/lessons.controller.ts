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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurriculumChangedInterceptor } from '../curriculum/curriculum-changed.interceptor.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import {
  CreateLessonDto,
  DocumentSettingsDto,
  DocumentUploadDto,
  ReorderLessonsDto,
  UpdateLessonDto,
  VideoUploadDto,
} from './dto/lessons.dto.js';
import { LessonOwnershipGuard } from './lesson-ownership.guard.js';
import { LessonRequestSanitizationInterceptor } from './lesson-request-sanitization.interceptor.js';
import { LessonsService } from './lessons.service.js';
import { maxVideoBytes } from '../../storage/media-storage.constants.js';
import { MEDIA_LIMITS } from '../../storage/media-storage.constants.js';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@Controller()
@UseGuards(OriginGuard, SessionGuard, LessonOwnershipGuard)
@UseInterceptors(
  LessonRequestSanitizationInterceptor,
  CurriculumChangedInterceptor,
)
@Roles('instructor', 'admin')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Post('chapters/:chapterId/lessons')
  @Header('Cache-Control', 'no-store')
  create(
    @Param('chapterId', uuid()) chapterId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.lessons.create(chapterId, dto);
  }

  @Post('chapters/:chapterId/lessons/video-upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxVideoBytes() } }),
  )
  @Header('Cache-Control', 'no-store')
  uploadVideo(
    @Param('chapterId', uuid()) chapterId: string,
    @Body() dto: VideoUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.lessons.createUploadedVideo(chapterId, dto, file);
  }

  @Post('chapters/:chapterId/lessons/document-upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.document } }),
  )
  @Header('Cache-Control', 'no-store')
  uploadDocument(
    @Param('chapterId', uuid()) chapterId: string,
    @Body() dto: DocumentUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.lessons.createUploadedDocument(chapterId, dto, file);
  }

  @Get('chapters/:chapterId/lessons')
  @Header('Cache-Control', 'no-store')
  list(@Param('chapterId', uuid()) chapterId: string) {
    return this.lessons.list(chapterId);
  }

  @Patch('chapters/:chapterId/lessons/reorder')
  @Header('Cache-Control', 'no-store')
  reorder(
    @Param('chapterId', uuid()) chapterId: string,
    @Body() dto: ReorderLessonsDto,
  ) {
    return this.lessons.reorder(chapterId, dto);
  }

  @Patch('lessons/:id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateLessonDto) {
    return this.lessons.update(id, dto);
  }

  @Post('lessons/:id/video-upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxVideoBytes() } }),
  )
  @Header('Cache-Control', 'no-store')
  replaceVideo(
    @Param('id', uuid()) id: string,
    @Body() dto: VideoUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.lessons.replaceUploadedVideo(id, dto, file);
  }

  @Post('lessons/:id/document-upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.document } }),
  )
  @Header('Cache-Control', 'no-store')
  replaceDocument(
    @Param('id', uuid()) id: string,
    @Body() dto: DocumentUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.lessons.replaceUploadedDocument(id, dto, file);
  }

  @Patch('lessons/:id/document-settings')
  @Header('Cache-Control', 'no-store')
  updateDocumentSettings(
    @Param('id', uuid()) id: string,
    @Body() dto: DocumentSettingsDto,
  ) {
    return this.lessons.updateDocumentSettings(id, dto);
  }

  @Delete('lessons/:id')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  remove(@Param('id', uuid()) id: string) {
    return this.lessons.remove(id);
  }
}
