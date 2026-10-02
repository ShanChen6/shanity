import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Chapter } from '../../courses/chapter.entity.js';
import type {
  CreateLessonDto,
  LessonContentDto,
  UpdateLessonDto,
} from './dto/lessons.dto.js';
import {
  Lesson,
  LessonType,
  MediaProcessingStatus,
  VideoProvider,
} from './entities/lesson.entity.js';

type ContentColumns = Pick<
  Lesson,
  | 'textBody'
  | 'videoAssetId'
  | 'videoExternalUrl'
  | 'videoProvider'
  | 'videoDurationSeconds'
  | 'videoStatus'
  | 'documentAssetId'
  | 'documentFileName'
  | 'documentFileSize'
  | 'documentDownloadAllowed'
>;

const EMPTY_CONTENT: ContentColumns = {
  textBody: null,
  videoAssetId: null,
  videoExternalUrl: null,
  videoProvider: null,
  videoDurationSeconds: null,
  videoStatus: null,
  documentAssetId: null,
  documentFileName: null,
  documentFileSize: null,
  documentDownloadAllowed: null,
};

const CONTENT_KEYS: Record<LessonType, (keyof LessonContentDto)[]> = {
  [LessonType.TEXT]: ['textBody'],
  [LessonType.VIDEO]: ['videoUrl', 'videoAssetId'],
  [LessonType.DOCUMENT]: [
    'documentAssetId',
    'documentFileName',
    'documentFileSize',
    'documentDownloadAllowed',
  ],
};

function externalProvider(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('content.videoUrl must be a valid URL');
  }
  if (url.protocol !== 'https:')
    throw new BadRequestException('content.videoUrl must use https');
  const host = url.hostname.toLowerCase();
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('youtube.com') || is('youtu.be')) return VideoProvider.YOUTUBE;
  if (is('vimeo.com')) return VideoProvider.VIMEO;
  throw new BadRequestException(
    'content.videoUrl must be a YouTube or Vimeo URL',
  );
}

export function buildContent(
  type: LessonType,
  content: LessonContentDto,
): { columns: ContentColumns; publishable: boolean } {
  const allowed = new Set(CONTENT_KEYS[type]);
  const unexpected = (Object.keys(content) as (keyof LessonContentDto)[]).filter(
    (key) => content[key] !== undefined && !allowed.has(key),
  );
  if (unexpected.length)
    throw new BadRequestException(
      `content fields ${unexpected.join(', ')} are not valid for type ${type}`,
    );

  const columns = { ...EMPTY_CONTENT };
  if (type === LessonType.TEXT) {
    if (!content.textBody?.trim())
      throw new BadRequestException('content.textBody is required for TEXT');
    columns.textBody = content.textBody;
    return { columns, publishable: true };
  }

  if (type === LessonType.VIDEO) {
    if ((content.videoUrl === undefined) === (content.videoAssetId === undefined))
      throw new BadRequestException(
        'Provide exactly one of content.videoUrl or content.videoAssetId for VIDEO',
      );
    if (content.videoUrl !== undefined) {
      columns.videoExternalUrl = content.videoUrl;
      columns.videoProvider = externalProvider(content.videoUrl);
      columns.videoStatus = MediaProcessingStatus.READY;
      return { columns, publishable: true };
    }
    if (!content.videoAssetId!.trim())
      throw new BadRequestException('content.videoAssetId must not be blank');
    columns.videoAssetId = content.videoAssetId!;
    columns.videoProvider = VideoProvider.S3;
    columns.videoStatus = MediaProcessingStatus.PROCESSING;
    return { columns, publishable: false };
  }

  if (
    !content.documentAssetId?.trim() ||
    !content.documentFileName?.trim() ||
    content.documentFileSize === undefined ||
    content.documentDownloadAllowed === undefined
  )
    throw new BadRequestException(
      'content.documentAssetId, documentFileName, documentFileSize and documentDownloadAllowed are required for DOCUMENT',
    );
  columns.documentAssetId = content.documentAssetId;
  columns.documentFileName = content.documentFileName;
  columns.documentFileSize = String(content.documentFileSize);
  columns.documentDownloadAllowed = content.documentDownloadAllowed;
  return { columns, publishable: true };
}

function slugify(title: string) {
  return (
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'lesson'
  );
}

@Injectable()
export class LessonsService {
  constructor(private readonly dataSource: DataSource) {}

  private async lockChapter(manager: EntityManager, chapterId: string) {
    const chapter = await manager.getRepository(Chapter).findOne({
      where: { id: chapterId },
      select: { id: true, courseId: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return chapter;
  }

  private async assertPositionFree(
    manager: EntityManager,
    chapterId: string,
    position: number,
    exceptId?: string,
  ) {
    const existing = await manager
      .getRepository(Lesson)
      .findOne({ where: { chapterId, position }, select: { id: true } });
    if (existing && existing.id !== exceptId)
      throw new ConflictException('Lesson position is already in use');
  }

  create(chapterId: string, dto: CreateLessonDto) {
    return this.dataSource.transaction(async (manager) => {
      const chapter = await this.lockChapter(manager, chapterId);
      const repository = manager.getRepository(Lesson);
      const { columns, publishable } = buildContent(dto.type, dto.content);

      let position = dto.position;
      if (position === undefined) {
        const aggregate = await repository
          .createQueryBuilder('lesson')
          .select('MAX(lesson.position)', 'maxPosition')
          .where('lesson.chapterId = :chapterId', { chapterId })
          .getRawOne<{ maxPosition: number | string | null }>();
        position = Number(aggregate?.maxPosition ?? -1) + 1;
      } else await this.assertPositionFree(manager, chapterId, position);

      const base = slugify(dto.title);
      const slugs = new Set(
        (
          await repository.find({
            where: { chapterId },
            select: { slug: true },
          })
        ).map(({ slug }) => slug),
      );
      let slug = base;
      for (let suffix = 2; slugs.has(slug); suffix++) slug = `${base}-${suffix}`;

      return repository.save(
        repository.create({
          courseId: chapter.courseId,
          chapterId,
          title: dto.title,
          slug,
          type: dto.type,
          position,
          isPreview: dto.isPreview ?? false,
          isPublished: publishable,
          ...columns,
        }),
      );
    });
  }

  list(chapterId: string) {
    return this.dataSource.getRepository(Lesson).find({
      where: { chapterId },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  async get(id: string) {
    const lesson = await this.dataSource
      .getRepository(Lesson)
      .findOneBy({ id });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  update(id: string, dto: UpdateLessonDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Lesson);
      const found = await repository.findOne({
        where: { id },
        select: { id: true, chapterId: true },
      });
      if (!found) throw new NotFoundException('Lesson not found');
      await this.lockChapter(manager, found.chapterId);
      const lesson = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');

      const type = dto.type ?? lesson.type;
      if (dto.type && dto.type !== lesson.type && !dto.content)
        throw new BadRequestException('content is required when changing type');

      const changes: Partial<Lesson> = {};
      if (dto.title !== undefined) changes.title = dto.title;
      if (dto.isPreview !== undefined) changes.isPreview = dto.isPreview;
      if (dto.type !== undefined) changes.type = dto.type;
      if (dto.content) {
        const { columns, publishable } = buildContent(type, dto.content);
        Object.assign(changes, columns, { isPublished: publishable });
      }
      if (dto.position !== undefined) {
        await this.assertPositionFree(manager, lesson.chapterId, dto.position, id);
        changes.position = dto.position;
      }

      if (Object.keys(changes).length)
        await repository.update({ id }, changes);
      return repository.findOneByOrFail({ id });
    });
  }

  async remove(id: string) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Lesson);
      const found = await repository.findOne({
        where: { id },
        select: { id: true, chapterId: true },
      });
      if (!found) throw new NotFoundException('Lesson not found');
      await this.lockChapter(manager, found.chapterId);
      const result = await repository.delete({ id });
      if (!result.affected) throw new NotFoundException('Lesson not found');
    });
  }
}
