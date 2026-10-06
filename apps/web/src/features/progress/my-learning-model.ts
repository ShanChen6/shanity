// Mirrors EnrolledCourseDto from apps/api/src/modules/progress/dto/enrolled-course.dto.ts.
export type EnrolledCourse = {
  courseId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  instructorName: string | null;
  progress: {
    percentage: number;
    completedRequiredLessons: number;
    totalRequiredLessons: number;
    lastAccessedLessonSlug: string | null;
    lastAccessedAt: string | null;
  };
};

export const LEARNING_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "in-progress", label: "Đang học" },
  { value: "completed", label: "Đã hoàn thành" },
] as const;
export const LEARNING_SORTS = [
  { value: "recent", label: "Gần đây nhất" },
  { value: "progress", label: "Tiến độ nhiều nhất" },
] as const;
export type LearningFilter = (typeof LEARNING_FILTERS)[number]["value"];
export type LearningSort = (typeof LEARNING_SORTS)[number]["value"];

// URL values are untrusted; unknown values fall back to the defaults.
export function parseFilter(value: string | null): LearningFilter {
  return LEARNING_FILTERS.find((item) => item.value === value)?.value ?? "all";
}
export function parseSort(value: string | null): LearningSort {
  return LEARNING_SORTS.find((item) => item.value === value)?.value ?? "recent";
}

export const isCompleted = (course: EnrolledCourse) =>
  course.progress.percentage >= 100;

export function filterCourses(
  courses: readonly EnrolledCourse[],
  filter: LearningFilter,
) {
  if (filter === "completed") return courses.filter(isCompleted);
  // Not-started courses are still "in progress" from the learner's view.
  if (filter === "in-progress")
    return courses.filter((course) => !isCompleted(course));
  return [...courses];
}

const accessedAt = (course: EnrolledCourse) => {
  const time = course.progress.lastAccessedAt
    ? Date.parse(course.progress.lastAccessedAt)
    : NaN;
  return Number.isNaN(time) ? -Infinity : time;
};

// Stable sorts: ties keep the server order (recent access, then enrollment).
export function sortCourses(
  courses: readonly EnrolledCourse[],
  sort: LearningSort,
) {
  // Compare, don't subtract: two never-opened courses would give NaN.
  const byRecent = (a: EnrolledCourse, b: EnrolledCourse) => {
    const left = accessedAt(a),
      right = accessedAt(b);
    return left === right ? 0 : right > left ? 1 : -1;
  };
  return [...courses].sort(
    sort === "progress"
      ? (a, b) =>
          b.progress.percentage - a.progress.percentage || byRecent(a, b)
      : byRecent,
  );
}

export type CourseAction = {
  kind: "start" | "resume" | "review";
  label: string;
  href: string;
};

export function courseAction(course: EnrolledCourse): CourseAction {
  const base = `/learn/${encodeURIComponent(course.slug)}`;
  const { percentage, lastAccessedLessonSlug } = course.progress;
  // /learn/[courseSlug] lands on the first accessible lesson.
  if (percentage >= 100)
    return { kind: "review", label: "Xem lại bài học", href: base };
  // Resume from the server-side pointer so it works across devices.
  const href = lastAccessedLessonSlug
    ? `${base}/${encodeURIComponent(lastAccessedLessonSlug)}`
    : base;
  return percentage > 0
    ? { kind: "resume", label: "Tiếp tục học", href }
    : { kind: "start", label: "Bắt đầu học", href };
}
