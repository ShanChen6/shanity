export class EnrolledCourseProgressDto {
  percentage!: number;
  completedRequiredLessons!: number;
  totalRequiredLessons!: number;
  // Completion gate, independent of percentage (see CourseProgressSummaryDto).
  isCompleted!: boolean;
  lastAccessedLessonSlug!: string | null;
  lastAccessedAt!: Date | null;
}

export class EnrolledCourseDto {
  courseId!: string;
  title!: string;
  slug!: string;
  thumbnailUrl!: string | null;
  instructorName!: string | null;
  progress!: EnrolledCourseProgressDto;
}
