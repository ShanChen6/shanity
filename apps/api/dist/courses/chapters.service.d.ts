import { DataSource } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import type { CreateChapterDto, ReorderChaptersDto, UpdateChapterDto } from './chapters.dto.js';
export declare class ChaptersService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    create(courseId: string, dto: CreateChapterDto): Promise<Chapter>;
    list(courseId: string): Promise<Chapter[]>;
    update(id: string, dto: UpdateChapterDto): Promise<Chapter>;
    remove(id: string): Promise<void>;
    reorder(courseId: string, dto: ReorderChaptersDto): Promise<Chapter[]>;
}
