export declare class CourseProgressSummaryDto {
    courseId: string;
    userId: string;
    totalLessons: number;
    totalRequiredLessons: number;
    completedLessons: number;
    completedRequiredLessons: number;
    totalQuizzes: number;
    totalRequiredQuizzes: number;
    passedQuizzes: number;
    passedRequiredQuizzes: number;
    percentage: number;
    isCompleted: boolean;
    lastAccessedLessonId?: string;
    updatedAt: Date;
}
