export declare class CreateCourseDto {
    category?: string;
    level?: string;
    language?: string;
    price?: number;
    title: string;
    slug: string;
    description?: string | null;
    shortDescription?: string | null;
    thumbnail?: string | null;
}
export declare class UpdateCourseDto {
    category?: string;
    level?: string;
    language?: string;
    price?: number;
    title?: string;
    slug?: string;
    description?: string | null;
    shortDescription?: string | null;
    thumbnail?: string | null;
    isSequential?: boolean;
}
