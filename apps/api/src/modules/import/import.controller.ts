import {
  Body,
  Controller,
  Header,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { ImportLessonFormDto, ImportQuizFormDto } from './import.dto.js';
import { MAX_IMPORT_BYTES } from './import-file.js';
import { ContentImportService } from './services/content-import.service.js';

// Memory storage: imports are parsed, never stored as files.
const upload = () =>
  FileInterceptor('file', {
    limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 10 },
  });

// Guards run before multer parses the body, so per-resource authority is
// checked in the service once the target is known from the form or file.
@Controller('admin/import')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class ContentImportController {
  constructor(private readonly imports: ContentImportService) {}

  @Post('lesson')
  @UseInterceptors(upload())
  @Header('Cache-Control', 'private, no-store')
  importLesson(
    @Req() req: AuthRequest,
    @Body() body: ImportLessonFormDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.importLesson(req.principal, body, file);
  }

  @Post('quiz')
  @UseInterceptors(upload())
  @Header('Cache-Control', 'private, no-store')
  importQuiz(
    @Req() req: AuthRequest,
    @Body() body: ImportQuizFormDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.importQuiz(req.principal, body, file);
  }
}
