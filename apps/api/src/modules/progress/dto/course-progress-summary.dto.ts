export class CourseProgressSummaryDto {
  courseId!: string;
  userId!: string;
  totalLessons!: number;
  totalRequiredLessons!: number;
  completedLessons!: number;
  completedRequiredLessons!: number;
  // Published course-bound quizzes of the course (never STANDALONE).
  totalQuizzes!: number;
  totalRequiredQuizzes!: number;
  passedQuizzes!: number;
  passedRequiredQuizzes!: number;
  // Learning progress for the UI bar: lessons and quizzes done / total.
  percentage!: number;
  // Course completion gate: required lessons + required quizzes passed.
  // Independent of percentage; optional quizzes never block it.
  isCompleted!: boolean;
  lastAccessedLessonId?: string;
  updatedAt!: Date;
}
