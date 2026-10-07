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
  // Quiz steps done: required ones passed, optional ones submitted.
  completedQuizzes!: number;
  // Learning progress for the UI bar: lessons and quiz steps done / total.
  percentage!: number;
  // Course completion gate: required lessons + required quizzes passed.
  // Independent of percentage; optional quizzes never block it.
  isCompleted!: boolean;
  lastAccessedLessonId?: string;
  updatedAt!: Date;
}
