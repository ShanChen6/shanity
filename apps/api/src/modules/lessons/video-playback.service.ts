import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
import { Lesson, LessonType } from './entities/lesson.entity.js';

@Injectable()
export class VideoPlaybackService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEDIA_STORAGE_DRIVER)
    private readonly mediaStorage: MediaStorageDriver,
  ) {}

  // Authorization is enforced by LessonAccessGuard before this is reached.
  async createAccess(lessonId: string) {
    const lesson = await this.dataSource.getRepository(Lesson).findOne({
      where: { id: lessonId, type: LessonType.VIDEO },
      select: {
        id: true,
        videoAssetId: true,
        videoExternalUrl: true,
        videoMimeType: true,
        videoFileSize: true,
      },
    });
    if (!lesson) throw new NotFoundException('Video lesson not found');
    if (lesson.videoExternalUrl)
      return { url: lesson.videoExternalUrl, expiresInSeconds: null };
    if (!lesson.videoAssetId)
      throw new NotFoundException('Video media not found');

    const expiresInSeconds = this.accessTtl();
    return {
      url: await this.mediaStorage.getSignedUrl(
        lesson.videoAssetId,
        expiresInSeconds,
      ),
      expiresInSeconds,
    };
  }

  async storedVideo(filePath: string) {
    const lesson = await this.dataSource.getRepository(Lesson).findOne({
      where: { videoAssetId: filePath, type: LessonType.VIDEO },
      select: { id: true, videoFileSize: true, videoMimeType: true },
    });
    if (!lesson?.videoFileSize || !lesson.videoMimeType)
      throw new NotFoundException('Video media not found');
    return {
      size: Number(lesson.videoFileSize),
      contentType: lesson.videoMimeType,
    };
  }

  getStream(filePath: string, range?: { start: number; end: number }) {
    return this.mediaStorage.getStream(filePath, range);
  }

  private accessTtl() {
    const seconds = Number(process.env.MEDIA_URL_TTL_SECONDS ?? 3600);
    if (!Number.isInteger(seconds) || seconds < 3600 || seconds > 7200)
      throw new Error('MEDIA_URL_TTL_SECONDS must be between 3600 and 7200');
    return seconds;
  }
}
