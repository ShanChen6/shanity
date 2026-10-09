"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

type ResumeCourse =
  | { hasActiveCourse: false }
  | {
      hasActiveCourse: true;
      course: { id: string; title: string; slug: string };
      resumeLesson: {
        id: string;
        title: string;
        slug: string;
        lastPosition: number;
      };
      progressPercentage: number;
    };

export function ResumeLearning() {
  const query = useQuery({
    queryKey: ["student", "resume-course"],
    queryFn: ({ signal }) =>
      api<ResumeCourse>("/api/v1/student/resume-course", { signal }),
    retry: false,
  });
  if (query.isPending || query.isError || !query.data.hasActiveCourse)
    return null;

  const { course, resumeLesson, progressPercentage } = query.data;
  return (
    <section className="mt-6 rounded-xl border border-primary/30 bg-surface p-5 shadow-md">
      <p className="text-sm font-semibold text-primary">Tiếp tục học</p>
      <h2 className="mt-2 text-xl font-semibold">{course.title}</h2>
      <p className="mt-1 text-sm text-muted">Bài: {resumeLesson.title}</p>
      <Progress
        className="mt-4"
        value={progressPercentage}
        label={`Tiến độ ${course.title}`}
      />
      <Link
        href={`/learn/${course.slug}/${resumeLesson.slug}`}
        className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        Tiếp tục học →
      </Link>
    </section>
  );
}
