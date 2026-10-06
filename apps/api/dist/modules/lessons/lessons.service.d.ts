import { DataSource } from 'typeorm';
import type { CreateLessonDto, DocumentSettingsDto, DocumentUploadDto, LessonContentDto, ReorderLessonsDto, UpdateLessonDto, VideoUploadDto } from './dto/lessons.dto.js';
import { Lesson, LessonType } from './entities/lesson.entity.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
type ContentColumns = Pick<Lesson, 'textBody' | 'videoAssetId' | 'videoExternalUrl' | 'videoProvider' | 'videoDurationSeconds' | 'videoFileSize' | 'videoMimeType' | 'videoStatus' | 'documentAssetId' | 'documentFileName' | 'documentFileSize' | 'documentMimeType' | 'documentFileType' | 'documentDownloadAllowed'>;
export declare function buildContent(type: LessonType, content: LessonContentDto): {
    columns: ContentColumns;
    publishable: boolean;
};
export declare class LessonsService {
    private readonly dataSource;
    private readonly mediaStorage;
    private readonly logger;
    constructor(dataSource: DataSource, mediaStorage: MediaStorageDriver);
    private lockChapter;
    private assertPositionFree;
    create(chapterId: string, dto: CreateLessonDto): Promise<Lesson>;
    list(chapterId: string): Promise<Lesson[]>;
    createUploadedVideo(chapterId: string, dto: VideoUploadDto, file?: Express.Multer.File): Promise<Lesson>;
    replaceUploadedVideo(id: string, dto: VideoUploadDto, file?: Express.Multer.File): Promise<Lesson>;
    createUploadedDocument(chapterId: string, dto: DocumentUploadDto, file?: Express.Multer.File): Promise<Lesson>;
    replaceUploadedDocument(id: string, dto: DocumentUploadDto, file?: Express.Multer.File): Promise<Lesson>;
    updateDocumentSettings(id: string, dto: DocumentSettingsDto): Promise<Lesson>;
    reorder(chapterId: string, dto: ReorderLessonsDto): Promise<Lesson[]>;
    get(id: string): Promise<Lesson>;
    update(id: string, dto: UpdateLessonDto): Promise<Lesson>;
    remove(id: string): Promise<void>;
    private videoStorageKey;
    private documentStorageKey;
    private documentFileType;
    private cleanupManagedVideo;
    private cleanupManagedMedia;
}
export {};
