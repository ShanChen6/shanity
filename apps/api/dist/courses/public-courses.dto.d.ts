export declare class PublicCourseQueryDto {
    page: number;
    limit: number;
    search?: string;
    instructorId?: string;
    sortBy: 'publishedAt' | 'createdAt';
    sortOrder: 'ASC' | 'DESC';
    status?: string;
}
