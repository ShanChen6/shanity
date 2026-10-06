export declare class EnrolledCourseProgressDto {
    percentage: number;
    completedRequiredLessons: number;
    totalRequiredLessons: number;
    lastAccessedLessonSlug: string | null;
    lastAccessedAt: Date | null;
}
export declare class EnrolledCourseDto {
    courseId: string;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
    instructorName: string | null;
    progress: EnrolledCourseProgressDto;
}
