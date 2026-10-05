import { DataSource } from 'typeorm';
import type { CreateLessonDto, LessonContentDto, UpdateLessonDto } from './dto/lessons.dto.js';
import { Lesson, LessonType } from './entities/lesson.entity.js';
type ContentColumns = Pick<Lesson, 'textBody' | 'videoAssetId' | 'videoExternalUrl' | 'videoProvider' | 'videoDurationSeconds' | 'videoStatus' | 'documentAssetId' | 'documentFileName' | 'documentFileSize' | 'documentDownloadAllowed'>;
export declare function buildContent(type: LessonType, content: LessonContentDto): {
    columns: ContentColumns;
    publishable: boolean;
};
export declare class LessonsService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    private lockChapter;
    private assertPositionFree;
    create(chapterId: string, dto: CreateLessonDto): Promise<Lesson>;
    list(chapterId: string): Promise<Lesson[]>;
    get(id: string): Promise<Lesson>;
    update(id: string, dto: UpdateLessonDto): Promise<Lesson>;
    remove(id: string): Promise<void>;
}
export {};
