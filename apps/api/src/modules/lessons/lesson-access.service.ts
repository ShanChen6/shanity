import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Lesson, LessonType } from './entities/lesson.entity.js';

@Injectable()
export class LessonAccessService {
  constructor(private readonly dataSource: DataSource) {}

  // Authorization is enforced by LessonAccessGuard before this is reached.
  async getAccessible(lessonId: string) {
    const lesson = await this.dataSource.getRepository(Lesson).findOne({
      where: { id: lessonId },
      select: {
        id: true,
        chapterId: true,
        title: true,
        slug: true,
        type: true,
        position: true,
        isPreview: true,
        isPublished: true,
        textBody: true,
        videoExternalUrl: true,
        videoProvider: true,
        videoDurationSeconds: true,
        documentFileName: true,
        documentFileSize: true,
        documentMimeType: true,
        documentFileType: true,
        documentDownloadAllowed: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return {
      id: lesson.id,
      chapterId: lesson.chapterId,
      title: lesson.title,
      slug: lesson.slug,
      type: lesson.type,
      position: lesson.position,
      isPreview: lesson.isPreview,
      isPublished: lesson.isPublished,
      ...(lesson.type === LessonType.TEXT ? { content: lesson.textBody } : {}),
      ...(lesson.type === LessonType.VIDEO
        ? {
            videoProvider: lesson.videoProvider,
            videoExternalUrl: lesson.videoExternalUrl,
            durationSeconds: lesson.videoDurationSeconds,
          }
        : {}),
      ...(lesson.type === LessonType.DOCUMENT
        ? {
            fileName: lesson.documentFileName,
            fileSize: lesson.documentFileSize,
            fileType: lesson.documentFileType,
            mimeType: lesson.documentMimeType,
            allowDownload: lesson.documentDownloadAllowed,
          }
        : {}),
    };
  }
}
