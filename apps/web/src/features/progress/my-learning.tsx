"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { CatalogThumbnail } from "@/features/courses/catalog-thumbnail";
import { useSession } from "@/features/auth/session-provider";
import { api, errorMessage } from "@/lib/api";
import {
  LEARNING_FILTERS,
  LEARNING_SORTS,
  courseAction,
  filterCourses,
  isCompleted,
  parseFilter,
  parseSort,
  sortCourses,
  type EnrolledCourse,
  type LearningFilter,
} from "./my-learning-model";

export const enrolledCoursesKey = (userId?: string) => [
  "student",
  "enrolled-courses",
  userId,
];

export function useEnrolledCourses() {
  const { user } = useSession();
  return useQuery({
    queryKey: enrolledCoursesKey(user?.id),
    queryFn: ({ signal }) =>
      api<EnrolledCourse[]>("/student/enrolled-courses", { signal }),
    enabled: Boolean(user),
    retry: false,
  });
}

export function MyLearning() {
  const query = useEnrolledCourses();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const sort = parseSort(params.get("sort"));

  // Keep filter/sort in the URL so reload, back and shared links restore them.
  function update(key: "filter" | "sort", value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }

  const courses = query.data ?? [];
  const counts: Record<LearningFilter, number> = {
    all: courses.length,
    "in-progress": filterCourses(courses, "in-progress").length,
    completed: filterCourses(courses, "completed").length,
  };
  const visible = sortCourses(filterCourses(courses, filter), sort);

  return (
    <main className="container flex-1 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-primary">
          GÓC HỌC TẬP
        </p>
        <h1 className="text-title font-semibold tracking-tight">
          Khóa học của tôi
        </h1>
        <p className="text-muted">
          Theo dõi tiến độ và tiếp tục ngay tại bài học bạn đang dừng lại.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div
          role="tablist"
          aria-label="Lọc khóa học"
          className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border bg-surface p-1"
        >
          {LEARNING_FILTERS.map((item) => {
            const active = item.value === filter;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                id={`my-learning-tab-${item.value}`}
                aria-selected={active}
                aria-controls="my-learning-panel"
                onClick={() => update("filter", item.value, "all")}
                className={`inline-flex min-h-10 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors duration-fast ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {item.label}
                {query.isSuccess && (
                  <span
                    className={`rounded-sm px-1.5 text-xs tabular-nums ${
                      active
                        ? "bg-primary-foreground/20"
                        : "bg-surface-secondary"
                    }`}
                  >
                    {counts[item.value]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium sm:w-56">
          Sắp xếp theo
          <Select
            value={sort}
            onChange={(event) => update("sort", event.target.value, "recent")}
          >
            {LEARNING_SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <section
        id="my-learning-panel"
        role="tabpanel"
        aria-labelledby={`my-learning-tab-${filter}`}
        aria-busy={query.isPending}
        className="mt-6"
      >
        {query.isPending ? (
          <CourseGridSkeleton />
        ) : query.isError ? (
          <div className="max-w-xl space-y-4">
            <Alert tone="error">
              Không thể tải tiến độ khóa học. {errorMessage(query.error)}
            </Alert>
            <Button variant="outline" onClick={() => void query.refetch()}>
              <Icon name="refresh" /> Thử lại
            </Button>
          </div>
        ) : !courses.length ? (
          <EmptyState
            className="rounded-lg border border-dashed border-border-strong bg-surface"
            icon={<Icon name="book" className="size-10" />}
            title="Bạn chưa ghi danh khóa học nào"
            description="Khám phá thư viện khóa học và bắt đầu hành trình học tập của bạn."
            action={
              <Link
                href="/courses"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Khám phá khóa học <Icon name="arrow" />
              </Link>
            }
          />
        ) : !visible.length ? (
          <EmptyState
            className="rounded-lg border border-dashed border-border-strong bg-surface"
            title={
              filter === "completed"
                ? "Chưa có khóa học nào hoàn thành"
                : "Bạn đã hoàn thành tất cả khóa học"
            }
            description={
              filter === "completed"
                ? "Hoàn thành tất cả bài học bắt buộc để khóa học xuất hiện ở đây."
                : "Tuyệt vời! Hãy khám phá thêm khóa học mới."
            }
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((course) => (
              <li key={course.courseId} className="flex">
                <LearningCourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function LearningCourseCard({ course }: { course: EnrolledCourse }) {
  const { percentage, completedRequiredLessons, totalRequiredLessons } =
    course.progress;
  const done = isCompleted(course);
  const action = courseAction(course);
  return (
    <article
      aria-label={course.title}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition duration-normal ease-out hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-within:border-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <CatalogThumbnail
        source={course.thumbnailUrl}
        title={course.title}
        badge={null}
      />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 font-heading text-lg font-semibold leading-snug">
              <Link
                href={`/courses/${encodeURIComponent(course.slug)}`}
                className="hover:text-primary"
              >
                {course.title}
              </Link>
            </h2>
            {done && (
              <Badge tone="success" className="shrink-0 gap-1">
                <Icon name="check" className="size-3.5" />
                Đã hoàn thành
              </Badge>
            )}
          </div>
          <p className="truncate text-sm text-muted">
            {course.instructorName ?? "Shanity"}
          </p>
        </div>
        <div className="mt-auto space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground-secondary">Tiến độ</span>
            <span
              className={`font-semibold tabular-nums ${done ? "text-success" : "text-primary"}`}
            >
              {percentage}%
            </span>
          </div>
          <Progress
            value={percentage}
            label={`Tiến độ ${course.title}`}
            indicatorClassName={
              done ? "bg-lesson-completed" : "bg-course-progress"
            }
          />
          <p className="text-xs text-muted">
            Đã hoàn thành {completedRequiredLessons}/{totalRequiredLessons} bài
            học bắt buộc
          </p>
        </div>
        <Link
          href={action.href}
          data-action={action.kind}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-fast ${
            action.kind === "review"
              ? "border border-border-strong text-foreground hover:bg-surface-hover"
              : "bg-primary text-primary-foreground hover:bg-primary-hover"
          }`}
        >
          {action.label}
          {action.kind !== "review" && <Icon name="arrow" />}
        </Link>
      </div>
    </article>
  );
}

function CourseGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <span className="sr-only">Đang tải khóa học…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
