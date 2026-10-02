export declare class CreateChapterDto {
    title: string;
    description?: string | null;
    position?: number;
}
export declare class UpdateChapterDto {
    title?: string;
    description?: string | null;
    position?: number;
}
export declare class ChapterOrderDto {
    id: string;
    position: number;
}
export declare class ReorderChaptersDto {
    chapterOrders: ChapterOrderDto[];
}
