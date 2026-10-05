import { DataSource } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import type { CreateChapterDto, ReorderChaptersDto, UpdateChapterDto } from './chapters.dto.js';
import type { MediaStorageDriver } from '../storage/media-storage.types.js';
export declare class ChaptersService {
    private readonly dataSource;
    private readonly mediaStorage;
    private readonly logger;
    constructor(dataSource: DataSource, mediaStorage: MediaStorageDriver);
    create(courseId: string, dto: CreateChapterDto): Promise<Chapter>;
    list(courseId: string): Promise<Chapter[]>;
    update(id: string, dto: UpdateChapterDto): Promise<Chapter>;
    remove(id: string): Promise<void>;
    reorder(courseId: string, dto: ReorderChaptersDto): Promise<Chapter[]>;
}
