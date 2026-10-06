export class CourseProgressSummaryDto {
  courseId!: string;
  userId!: string;
  totalLessons!: number;
  totalRequiredLessons!: number;
  completedLessons!: number;
  completedRequiredLessons!: number;
  percentage!: number;
  isCompleted!: boolean;
  lastAccessedLessonId?: string;
  updatedAt!: Date;
}
