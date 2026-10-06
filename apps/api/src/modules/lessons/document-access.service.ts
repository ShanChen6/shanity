import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
import { LessonType } from './entities/lesson.entity.js';

type DocumentRow = {
  id: string;
  storageKey: string | null;
  fileName: string | null;
  fileSize: string | null;
  mimeType: string | null;
  allowDownload: boolean | null;
};

@Injectable()
export class DocumentAccessService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEDIA_STORAGE_DRIVER)
    private readonly mediaStorage: MediaStorageDriver,
  ) {}

  async open(
    lessonId: string,
    behavior: 'view' | 'download',
    bypass: boolean,
  ) {
    const document = await this.findDocument(lessonId);
    if (!document) throw new NotFoundException('Document lesson not found');
    if (behavior === 'download' && !document.allowDownload && !bypass)
      throw new ForbiddenException('DOWNLOAD_NOT_ALLOWED');
    if (
      !document.storageKey ||
      !document.fileName ||
      !document.fileSize ||
      !document.mimeType
    )
      throw new NotFoundException('Document media not found');

    return {
      stream: await this.mediaStorage.getStream(document.storageKey),
      fileName: document.fileName,
      fileSize: Number(document.fileSize),
      mimeType: document.mimeType,
    };
  }

  private async findDocument(lessonId: string) {
    const [row] = await this.dataSource.query<DocumentRow[]>(
      `SELECT lesson.id,
          lesson.document_asset_id AS "storageKey",
          lesson.document_file_name AS "fileName",
          lesson.document_file_size AS "fileSize",
          lesson.document_mime_type AS "mimeType",
          lesson.document_download_allowed AS "allowDownload"
        FROM lessons lesson
        WHERE lesson.id = $1 AND lesson.type = $2`,
      [lessonId, LessonType.DOCUMENT],
    );
    return row;
  }
}
