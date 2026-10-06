import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { Chapter } from '../../courses/chapter.entity.js';
import { sanitizeLessonHtml } from '../../security/html-sanitizer.js';
import type {
  CreateLessonDto,
  DocumentSettingsDto,
  DocumentUploadDto,
  LessonContentDto,
  ReorderLessonsDto,
  UpdateLessonDto,
  VideoUploadDto,
} from './dto/lessons.dto.js';
import {
  Lesson,
  DocumentFileType,
  LessonType,
  MediaProcessingStatus,
  VideoProvider,
} from './entities/lesson.entity.js';
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';

type ContentColumns = Pick<
  Lesson,
  | 'textBody'
  | 'videoAssetId'
  | 'videoExternalUrl'
  | 'videoProvider'
  | 'videoDurationSeconds'
  | 'videoFileSize'
  | 'videoMimeType'
  | 'videoStatus'
  | 'documentAssetId'
  | 'documentFileName'
  | 'documentFileSize'
  | 'documentMimeType'
  | 'documentFileType'
  | 'documentDownloadAllowed'
>;

const EMPTY_CONTENT: ContentColumns = {
  textBody: null,
  videoAssetId: null,
  videoExternalUrl: null,
  videoProvider: null,
  videoDurationSeconds: null,
  videoFileSize: null,
  videoMimeType: null,
  videoStatus: null,
  documentAssetId: null,
  documentFileName: null,
  documentFileSize: null,
  documentMimeType: null,
  documentFileType: null,
  documentDownloadAllowed: null,
};

const MAX_POSITION = 2_147_483_647;

function findTemporaryPositions(reservedValues: number[], count: number) {
  const reserved = [...new Set(reservedValues)].sort(
    (left, right) => left - right,
  );
  const positions: number[] = [];
  let candidate = 0;

  for (const value of reserved) {
    while (candidate < value && positions.length < count)
      positions.push(candidate++);
    if (positions.length === count) return positions;
    if (candidate === value) candidate++;
  }

  while (candidate <= MAX_POSITION && positions.length < count)
    positions.push(candidate++);
  return positions.length === count ? positions : undefined;
}

const CONTENT_KEYS: Record<LessonType, (keyof LessonContentDto)[]> = {
  [LessonType.TEXT]: ['textBody'],
  [LessonType.VIDEO]: ['videoUrl'],
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
  const unexpected = (
    Object.keys(content) as (keyof LessonContentDto)[]
  ).filter((key) => content[key] !== undefined && !allowed.has(key));
  if (unexpected.length)
    throw new BadRequestException(
      `content fields ${unexpected.join(', ')} are not valid for type ${type}`,
    );

  const columns = { ...EMPTY_CONTENT };
  if (type === LessonType.TEXT) {
    if (!content.textBody?.trim())
      throw new BadRequestException('content.textBody is required for TEXT');
    const sanitized = sanitizeLessonHtml(content.textBody);
    if (!sanitized)
      throw new BadRequestException(
        'content.textBody must contain safe, non-empty content',
      );
    columns.textBody = sanitized;
    return { columns, publishable: true };
  }

  if (type === LessonType.VIDEO) {
    if (content.videoUrl === undefined)
      throw new BadRequestException(
        'content.videoUrl is required; managed videos must use video-upload',
      );
    columns.videoExternalUrl = content.videoUrl;
    columns.videoProvider = externalProvider(content.videoUrl);
    columns.videoStatus = MediaProcessingStatus.READY;
    return { columns, publishable: true };
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
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(MEDIA_STORAGE_DRIVER)
    private readonly mediaStorage: MediaStorageDriver,
  ) {}

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
      for (let suffix = 2; slugs.has(slug); suffix++)
        slug = `${base}-${suffix}`;

      return repository.save(
        repository.create({
          courseId: chapter.courseId,
          chapterId,
          title: dto.title,
          slug,
          type: dto.type,
          position,
          isPreview: dto.isPreview ?? false,
          isRequired: dto.isRequired ?? true,
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

  async createUploadedVideo(
    chapterId: string,
    dto: VideoUploadDto,
    file?: Express.Multer.File,
  ) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!file?.buffer?.length)
      throw new BadRequestException('A video file is required');

    const chapter = await this.dataSource.getRepository(Chapter).findOne({
      where: { id: chapterId },
      select: { id: true, courseId: true },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    const lessonId = randomUUID();
    const storageKey = this.videoStorageKey(
      chapter.courseId,
      lessonId,
      file.originalname,
    );
    const stored = await this.mediaStorage.upload(file, storageKey, {
      kind: 'video',
    });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const lockedChapter = await this.lockChapter(manager, chapterId);
        const repository = manager.getRepository(Lesson);
        const aggregate = await repository
          .createQueryBuilder('lesson')
          .select('MAX(lesson.position)', 'maxPosition')
          .where('lesson.chapterId = :chapterId', { chapterId })
          .getRawOne<{ maxPosition: number | string | null }>();
        const base = slugify(dto.title!);
        const slugs = new Set(
          (
            await repository.find({
              where: { chapterId },
              select: { slug: true },
            })
          ).map(({ slug }) => slug),
        );
        let slug = base;
        for (let suffix = 2; slugs.has(slug); suffix++)
          slug = `${base}-${suffix}`;

        return repository.save(
          repository.create({
            id: lessonId,
            courseId: lockedChapter.courseId,
            chapterId,
            title: dto.title!,
            slug,
            type: LessonType.VIDEO,
            position: Number(aggregate?.maxPosition ?? -1) + 1,
            isPreview: dto.isPreview ?? false,
            isRequired: dto.isRequired ?? true,
            isPublished: true,
            ...EMPTY_CONTENT,
            videoAssetId: stored.filePath,
            videoProvider:
              this.mediaStorage.provider === 'LOCAL'
                ? VideoProvider.LOCAL
                : VideoProvider.S3,
            videoDurationSeconds: dto.durationSeconds ?? null,
            videoFileSize: String(stored.size),
            videoMimeType: stored.contentType,
            videoStatus: MediaProcessingStatus.READY,
          }),
        );
      });
    } catch (error) {
      await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
      throw error;
    }
  }

  async replaceUploadedVideo(
    id: string,
    dto: VideoUploadDto,
    file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('A video file is required');
    const existing = await this.dataSource.getRepository(Lesson).findOne({
      where: { id },
      select: {
        id: true,
        courseId: true,
        chapterId: true,
        type: true,
        videoAssetId: true,
      },
    });
    if (!existing) throw new NotFoundException('Lesson not found');
    if (existing.type !== LessonType.VIDEO)
      throw new BadRequestException('Only VIDEO lessons accept video uploads');

    const storageKey = this.videoStorageKey(
      existing.courseId,
      id,
      file.originalname,
    );
    const stored = await this.mediaStorage.upload(file, storageKey, {
      kind: 'video',
    });
    let lesson: Lesson;
    let replacedAssetId: string | null = null;
    try {
      lesson = await this.dataSource.transaction(async (manager) => {
        await this.lockChapter(manager, existing.chapterId);
        const repository = manager.getRepository(Lesson);
        const locked = await repository.findOne({
          where: { id, chapterId: existing.chapterId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Lesson not found');
        if (locked.type !== LessonType.VIDEO)
          throw new BadRequestException(
            'Only VIDEO lessons accept video uploads',
          );
        replacedAssetId = locked.videoAssetId;
        await repository.update(
          { id },
          {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.isPreview !== undefined
              ? { isPreview: dto.isPreview }
              : {}),
            ...(dto.isRequired !== undefined
              ? { isRequired: dto.isRequired }
              : {}),
            videoAssetId: stored.filePath,
            videoExternalUrl: null,
            videoProvider:
              this.mediaStorage.provider === 'LOCAL'
                ? VideoProvider.LOCAL
                : VideoProvider.S3,
            videoDurationSeconds: dto.durationSeconds ?? null,
            videoFileSize: String(stored.size),
            videoMimeType: stored.contentType,
            videoStatus: MediaProcessingStatus.READY,
            isPublished: true,
          },
        );
        return repository.findOneByOrFail({ id });
      });
    } catch (error) {
      await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
      throw error;
    }
    await this.cleanupManagedVideo(replacedAssetId);
    return lesson;
  }

  async createUploadedDocument(
    chapterId: string,
    dto: DocumentUploadDto,
    file?: Express.Multer.File,
  ) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!file?.buffer?.length)
      throw new BadRequestException('A document file is required');

    const chapter = await this.dataSource.getRepository(Chapter).findOne({
      where: { id: chapterId },
      select: { id: true, courseId: true },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    const lessonId = randomUUID();
    const stored = await this.mediaStorage.upload(
      file,
      this.documentStorageKey(chapter.courseId, lessonId, file.originalname),
      { kind: 'document' },
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const lockedChapter = await this.lockChapter(manager, chapterId);
        const repository = manager.getRepository(Lesson);
        const aggregate = await repository
          .createQueryBuilder('lesson')
          .select('MAX(lesson.position)', 'maxPosition')
          .where('lesson.chapterId = :chapterId', { chapterId })
          .getRawOne<{ maxPosition: number | string | null }>();
        const base = slugify(dto.title!);
        const slugs = new Set(
          (
            await repository.find({
              where: { chapterId },
              select: { slug: true },
            })
          ).map(({ slug }) => slug),
        );
        let slug = base;
        for (let suffix = 2; slugs.has(slug); suffix++)
          slug = `${base}-${suffix}`;

        return repository.save(
          repository.create({
            id: lessonId,
            courseId: lockedChapter.courseId,
            chapterId,
            title: dto.title!,
            slug,
            type: LessonType.DOCUMENT,
            position: Number(aggregate?.maxPosition ?? -1) + 1,
            isPreview: dto.isPreview ?? false,
            isRequired: dto.isRequired ?? true,
            isPublished: true,
            ...EMPTY_CONTENT,
            documentAssetId: stored.filePath,
            documentFileName: file.originalname,
            documentFileSize: String(stored.size),
            documentMimeType: stored.contentType,
            documentFileType: this.documentFileType(stored.contentType),
            documentDownloadAllowed: dto.allowDownload ?? false,
          }),
        );
      });
    } catch (error) {
      await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
      throw error;
    }
  }

  async replaceUploadedDocument(
    id: string,
    dto: DocumentUploadDto,
    file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('A document file is required');
    const existing = await this.dataSource.getRepository(Lesson).findOne({
      where: { id },
      select: {
        id: true,
        courseId: true,
        chapterId: true,
        type: true,
      },
    });
    if (!existing) throw new NotFoundException('Lesson not found');
    if (existing.type !== LessonType.DOCUMENT)
      throw new BadRequestException(
        'Only DOCUMENT lessons accept document uploads',
      );
    const stored = await this.mediaStorage.upload(
      file,
      this.documentStorageKey(existing.courseId, id, file.originalname),
      { kind: 'document' },
    );
    let replacedAssetId: string | null = null;
    let lesson: Lesson;
    try {
      lesson = await this.dataSource.transaction(async (manager) => {
        await this.lockChapter(manager, existing.chapterId);
        const repository = manager.getRepository(Lesson);
        const locked = await repository.findOne({
          where: { id, chapterId: existing.chapterId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Lesson not found');
        if (locked.type !== LessonType.DOCUMENT)
          throw new BadRequestException(
            'Only DOCUMENT lessons accept document uploads',
          );
        replacedAssetId = locked.documentAssetId;
        await repository.update(
          { id },
          {
            ...(dto.title !== undefined ? { title: dto.title } : {}),
            ...(dto.isPreview !== undefined
              ? { isPreview: dto.isPreview }
              : {}),
            ...(dto.isRequired !== undefined
              ? { isRequired: dto.isRequired }
              : {}),
            ...(dto.allowDownload !== undefined
              ? { documentDownloadAllowed: dto.allowDownload }
              : {}),
            documentAssetId: stored.filePath,
            documentFileName: file.originalname,
            documentFileSize: String(stored.size),
            documentMimeType: stored.contentType,
            documentFileType: this.documentFileType(stored.contentType),
            isPublished: true,
          },
        );
        return repository.findOneByOrFail({ id });
      });
    } catch (error) {
      await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
      throw error;
    }
    await this.cleanupManagedMedia(replacedAssetId, 'Document');
    return lesson;
  }

  async updateDocumentSettings(id: string, dto: DocumentSettingsDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Lesson);
      const lesson = await repository.findOne({
        where: { id },
        select: { id: true, chapterId: true, type: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      if (lesson.type !== LessonType.DOCUMENT)
        throw new BadRequestException('Lesson is not a document');
      await this.lockChapter(manager, lesson.chapterId);
      await repository.update(
        { id, type: LessonType.DOCUMENT },
        { documentDownloadAllowed: dto.allowDownload },
      );
      return repository.findOneByOrFail({ id });
    });
  }

  reorder(chapterId: string, dto: ReorderLessonsDto) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockChapter(manager, chapterId);
      const repository = manager.getRepository(Lesson);
      const lessons = await repository.find({
        where: { chapterId },
        select: { id: true, position: true },
        lock: { mode: 'pessimistic_write' },
      });
      const submittedIds = new Set(dto.lessonOrders.map(({ id }) => id));
      const submittedPositions = dto.lessonOrders.map(
        ({ position }) => position,
      );

      if (
        dto.lessonOrders.length !== lessons.length ||
        submittedIds.size !== dto.lessonOrders.length ||
        lessons.some((lesson) => !submittedIds.has(lesson.id))
      )
        throw new BadRequestException(
          'lessonOrders must contain every lesson in this chapter exactly once',
        );
      if (new Set(submittedPositions).size !== submittedPositions.length)
        throw new BadRequestException('Lesson positions must be unique');

      const temporaryPositions = findTemporaryPositions(
        [...lessons.map(({ position }) => position), ...submittedPositions],
        lessons.length,
      );
      if (!temporaryPositions)
        throw new BadRequestException('No safe temporary positions available');

      for (const [index, lesson] of lessons.entries()) {
        const result = await repository.update(
          { id: lesson.id, chapterId },
          { position: temporaryPositions[index]! },
        );
        if (!result.affected) throw new NotFoundException('Lesson not found');
      }

      for (const lesson of dto.lessonOrders) {
        const result = await repository.update(
          { id: lesson.id, chapterId },
          { position: lesson.position },
        );
        if (!result.affected) throw new NotFoundException('Lesson not found');
      }

      return repository.find({
        where: { chapterId },
        order: { position: 'ASC', id: 'ASC' },
      });
    });
  }

  async get(id: string) {
    const lesson = await this.dataSource
      .getRepository(Lesson)
      .findOneBy({ id });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async update(id: string, dto: UpdateLessonDto) {
    let previousVideoAssetId: string | null = null;
    let previousDocumentAssetId: string | null = null;
    const updated = await this.dataSource.transaction(async (manager) => {
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
      previousVideoAssetId = lesson.videoAssetId;
      previousDocumentAssetId = lesson.documentAssetId;

      const type = dto.type ?? lesson.type;
      if (dto.type && dto.type !== lesson.type && !dto.content)
        throw new BadRequestException('content is required when changing type');

      const changes: Partial<Lesson> = {};
      if (dto.title !== undefined) changes.title = dto.title;
      if (dto.isPreview !== undefined) changes.isPreview = dto.isPreview;
      if (dto.isRequired !== undefined) changes.isRequired = dto.isRequired;
      if (dto.type !== undefined) changes.type = dto.type;
      if (dto.content) {
        const { columns, publishable } = buildContent(type, dto.content);
        Object.assign(changes, columns, { isPublished: publishable });
      }
      if (dto.isPublished !== undefined) changes.isPublished = dto.isPublished;
      if (dto.position !== undefined) {
        await this.assertPositionFree(
          manager,
          lesson.chapterId,
          dto.position,
          id,
        );
        changes.position = dto.position;
      }

      if (Object.keys(changes).length) await repository.update({ id }, changes);
      return repository.findOneByOrFail({ id });
    });
    if (previousVideoAssetId && previousVideoAssetId !== updated.videoAssetId)
      await this.cleanupManagedVideo(previousVideoAssetId);
    if (
      previousDocumentAssetId &&
      previousDocumentAssetId !== updated.documentAssetId
    )
      await this.cleanupManagedMedia(previousDocumentAssetId, 'Document');
    return updated;
  }

  async remove(id: string) {
    let videoAssetId: string | null = null;
    let documentAssetId: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Lesson);
      const found = await repository.findOne({
        where: { id },
        select: {
          id: true,
          chapterId: true,
          videoAssetId: true,
          documentAssetId: true,
        },
      });
      if (!found) throw new NotFoundException('Lesson not found');
      videoAssetId = found.videoAssetId;
      documentAssetId = found.documentAssetId;
      await this.lockChapter(manager, found.chapterId);
      const result = await repository.delete({ id });
      if (!result.affected) throw new NotFoundException('Lesson not found');
    });
    await this.cleanupManagedVideo(videoAssetId);
    await this.cleanupManagedMedia(documentAssetId, 'Document');
  }

  private videoStorageKey(
    courseId: string,
    lessonId: string,
    originalName: string,
  ) {
    return `attached/${courseId}/${lessonId}/${randomUUID()}${extname(originalName).toLowerCase()}`;
  }

  private documentStorageKey(
    courseId: string,
    lessonId: string,
    originalName: string,
  ) {
    return `attached/${courseId}/${lessonId}/${randomUUID()}${extname(originalName).toLowerCase()}`;
  }

  private documentFileType(contentType: string) {
    if (contentType === 'application/pdf') return DocumentFileType.PDF;
    if (
      contentType ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
      return DocumentFileType.SLIDE;
    if (
      contentType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      return DocumentFileType.DOCX;
    return DocumentFileType.OTHER;
  }

  private async cleanupManagedVideo(storageKey: string | null) {
    return this.cleanupManagedMedia(storageKey, 'Video');
  }

  private async cleanupManagedMedia(
    storageKey: string | null,
    label: 'Video' | 'Document',
  ) {
    if (!storageKey) return;
    try {
      await this.mediaStorage.delete(storageKey);
    } catch {
      this.logger.warn(`${label} cleanup deferred for ${storageKey}`);
    }
  }
}
