"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import type { CourseProgressSummary } from "./use-course-progress";

type EnrolledCourse = {
  course: { id: string; title: string; slug: string; thumbnail: string | null };
  progress: CourseProgressSummary;
  lastAccessedLessonSlug?: string;
};

export function EnrolledCourses() {
  const query = useQuery({
    queryKey: ["student", "enrolled-courses"],
    queryFn: ({ signal }) =>
      api<EnrolledCourse[]>("/student/enrolled-courses", { signal }),
    retry: false,
  });

  if (query.isPending)
    return <p className="mt-6 text-muted">Đang tải khóa học…</p>;
  if (query.isError)
    return <p className="mt-6 text-danger">Không thể tải tiến độ khóa học.</p>;
  if (!query.data.length)
    return <p className="mt-6 text-muted">Bạn chưa ghi danh khóa học nào.</p>;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {query.data.map(({ course, progress, lastAccessedLessonSlug }) => {
        const href = lastAccessedLessonSlug
          ? `/learn/${course.slug}/${lastAccessedLessonSlug}`
          : `/learn/${course.slug}`;
        return (
          <article
            key={course.id}
            className="rounded-xl border border-border p-5"
          >
            <h2 className="font-semibold">{course.title}</h2>
            <Progress
              className="mt-4"
              value={progress.percentage}
              label={`Tiến độ ${course.title}`}
            />
            <p className="mt-2 text-sm text-muted">
              Đã hoàn thành {progress.completedRequiredLessons}/
              {progress.totalRequiredLessons} bài học bắt buộc ·{" "}
              {progress.percentage}%
            </p>
            <Link href={href} className="mt-4 inline-block text-primary">
              {progress.lastAccessedLessonId ? "Tiếp tục học" : "Bắt đầu học"} →
            </Link>
          </article>
        );
      })}
    </div>
  );
}
