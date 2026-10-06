export declare enum LessonProgressStatus {
    NOT_STARTED = "NOT_STARTED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED"
}
export declare class LessonProgress {
    id: string;
    userId: string;
    enrollmentId: string;
    lessonId: string;
    courseId: string;
    status: LessonProgressStatus;
    lastPosition: number;
    startedAt: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
}
