"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Failure } from "@/features/instructor/shared";
import { useDebounce } from "@/hooks/useDebounce";
import { API_URL } from "@/lib/api";
import {
  useCourseQuizOptions,
  useGradingCourses,
  useGradingQueue,
} from "./api";
import {
  gradingHref,
  groupByQuiz,
  pendingLabel,
  STATUS_TABS,
  type GradingQueueItem,
  type QueueStatus,
} from "./model";

const dateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";

const avatarSrc = (path: string | null) =>
  path && /^\/avatars\/[0-9a-f-]{36}\.webp$/.test(path)
    ? `${API_URL}${path}`
    : undefined;

function Row({ item }: { item: GradingQueueItem }) {
  const pending = item.pendingEssaysCount > 0;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar
        name={item.student.fullName}
        src={avatarSrc(item.student.avatarUrl)}
        unoptimized
        className="size-9"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.student.fullName}</p>
        <p className="truncate text-xs text-muted">
          {item.student.email} · Nộp {dateTime(item.submittedAt)}
        </p>
      </div>
      <Badge tone={pending ? "warning" : "success"}>
        {pendingLabel(item)}
      </Badge>
      <Link
        href={gradingHref(item.attemptId)}
        className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-semibold hover:bg-surface-hover"
      >
        {pending ? "Chấm bài" : "Xem lại"}
      </Link>
    </li>
  );
}

/** /instructor/grading: submitted essay attempts of the courses you teach. */
export function GradingQueue() {
  const [courseId, setCourseId] = useState("");
  const [quizId, setQuizId] = useState("");
  const [status, setStatus] = useState<QueueStatus>("NEEDS_GRADING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 400);

  const courses = useGradingCourses();
  const quizzes = useCourseQuizOptions(courseId);
  const queue = useGradingQueue({
    courseId,
    quizId,
    status,
    search: debouncedSearch,
    page,
  });
  const groups = groupByQuiz(queue.data?.items ?? []);
  const pagination = queue.data?.pagination;
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">ASSESSMENT</p>
          <h1>Hàng chờ chấm bài</h1>
          <p>Bài tự luận học viên đã nộp trong các khóa học bạn phụ trách.</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium">
          Khóa học
          <Select
            className="mt-2"
            value={courseId}
            onChange={(event) => {
              filter(setCourseId)(event.target.value);
              setQuizId("");
            }}
          >
            <option value="">Tất cả khóa học</option>
            {(courses.data ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium">
          Bài quiz
          <Select
            className="mt-2"
            value={quizId}
            disabled={!courseId}
            onChange={(event) => filter(setQuizId)(event.target.value)}
          >
            <option value="">
              {courseId ? "Tất cả bài quiz" : "Chọn khóa học trước"}
            </option>
            {(quizzes.data ?? []).map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium lg:col-span-2">
          Tìm học viên
          <Input
            className="mt-2"
            value={search}
            placeholder="Tên hoặc email"
            onChange={(event) => filter(setSearch)(event.target.value)}
          />
        </label>
      </div>

      <div role="tablist" aria-label="Trạng thái chấm" className="mb-4 flex gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={status === tab.value}
            onClick={() => filter(setStatus)(tab.value)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              status === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong hover:bg-surface-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {queue.error ? (
        <Failure error={queue.error} retry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <p className="text-sm text-muted">Đang tải…</p>
      ) : !groups.length ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
          Không có bài nộp nào khớp bộ lọc.
        </div>
      ) : (
        <div className="space-y-5" data-testid="grading-groups">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-label={group.quizTitle}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <header className="flex flex-wrap items-baseline gap-2 border-b border-border bg-surface-secondary px-4 py-3">
                <h2 className="text-sm font-semibold">{group.quizTitle}</h2>
                <span className="text-xs text-muted">
                  {group.courseTitle ?? "Quiz độc lập"} · {group.items.length}{" "}
                  bài nộp
                  {group.pending ? ` · ${group.pending} essays pending` : ""}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {group.items.map((item) => (
                  <Row key={item.attemptId} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </Button>
          <span>
            Trang {pagination.page}/{pagination.totalPages} ·{" "}
            {pagination.totalItems} bài nộp
          </span>
          <Button
            variant="outline"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </div>
      ) : null}
    </>
  );
}
