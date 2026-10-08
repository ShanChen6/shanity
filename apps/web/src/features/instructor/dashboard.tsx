"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QueryBoundary } from "@/components/shared/query-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/session-provider";
import { useGradingQueue } from "@/features/grading-queue/api";
import { PENDING_GRADING } from "@/features/grading-queue/model";
import { api } from "@/lib/api";
import type { Course } from "./data";

const PREVIEW_ROWS = 5;

const shortcut =
  "inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-hover";

/** /instructor/dashboard: what needs the instructor's attention right now. */
export function InstructorDashboard() {
  const { user } = useSession();
  // Same key as the course list, so opening either warms the other.
  const courses = useQuery({
    queryKey: ["instructor", "courses"],
    queryFn: ({ signal }) =>
      api<Course[]>("/api/v1/instructor/courses", { signal }),
  });
  const grading = useGradingQueue(PENDING_GRADING);
  const owned = (courses.data ?? []).filter(
    (course) => course.ownerId === user?.id,
  );

  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">TỔNG QUAN</p>
          <h1>Xin chào, {user?.displayName}</h1>
          <p>Việc cần làm hôm nay trong không gian giảng viên.</p>
        </div>
        <Link
          className="instructor-primary-link"
          href="/instructor/courses/new"
        >
          ＋ Tạo khóa học
        </Link>
      </div>

      <section aria-label="Số liệu nhanh" className="instructor-summary">
        <div>
          <strong>{courses.isPending ? "–" : owned.length}</strong>
          <span>Tổng khóa học</span>
        </div>
        <div>
          <strong>
            {courses.isPending
              ? "–"
              : owned.filter((course) => course.status === "published").length}
          </strong>
          <span>Đã xuất bản</span>
        </div>
        <div>
          <strong>
            {grading.data ? grading.data.pagination.totalItems : "–"}
          </strong>
          <span>Bài cần chấm</span>
        </div>
      </section>

      <section aria-labelledby="pending-grading" className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="pending-grading" className="text-lg font-semibold">
            Bài làm cần chấm
          </h2>
          <Link
            href="/instructor/grading"
            className="text-sm font-semibold text-primary"
          >
            Xem tất cả →
          </Link>
        </div>
        <QueryBoundary
          query={grading}
          errorTitle="Không tải được hàng chờ chấm bài"
          loading={<Skeleton className="h-40 w-full" />}
          isEmpty={(page) => page.items.length === 0}
          empty={{
            title: "Không có bài nào đang chờ chấm",
            description: "Bài tự luận mới nộp sẽ xuất hiện ở đây.",
          }}
        >
          {(page) => (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {page.items.slice(0, PREVIEW_ROWS).map((item) => (
                <li key={item.attemptId}>
                  <Link
                    href={`/instructor/grading/attempts/${item.attemptId}`}
                    className="flex flex-col gap-1 p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {item.student.fullName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {item.quiz.title}
                        {item.course ? ` · ${item.course.title}` : ""}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {item.pendingEssaysCount} câu tự luận chờ chấm
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </section>

      <section aria-labelledby="shortcuts">
        <h2 id="shortcuts" className="mb-3 text-lg font-semibold">
          Lối tắt
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/instructor/courses" className={shortcut}>
            Khóa học của tôi
          </Link>
          <Link href="/instructor/quizzes/create" className={shortcut}>
            Tạo bài kiểm tra
          </Link>
          <Link href="/instructor/grading" className={shortcut}>
            Chấm bài
          </Link>
        </div>
      </section>
    </>
  );
}
