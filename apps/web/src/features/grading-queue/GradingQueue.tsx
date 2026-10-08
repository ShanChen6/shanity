"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Coffee, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { Failure } from "@/features/instructor/shared";
import { useDebounce } from "@/hooks/useDebounce";
import { API_URL, ApiError, errorMessage } from "@/lib/api";
import {
  useCourseQuizOptions,
  useGradingCourses,
  useGradingQueue,
  usePublishAttempt,
  usePublishQuizResults,
} from "./api";
import {
  gradingHref,
  groupByQuiz,
  statusBadge,
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

function Row({
  item,
  publishing,
  onPublish,
}: {
  item: GradingQueueItem;
  publishing: boolean;
  onPublish: (attemptId: string) => void;
}) {
  const pending = item.status === "NEEDS_GRADING";
  const badge = statusBadge(item);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
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
      <Badge tone={badge.tone}>{badge.label}</Badge>
      {item.status === "GRADED" ? (
        <Button
          size="sm"
          loading={publishing}
          loadingLabel="Đang công bố…"
          onClick={() => onPublish(item.attemptId)}
        >
          Publish Result
        </Button>
      ) : null}
      <Link
        href={gradingHref(item.attemptId)}
        className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-sm font-semibold hover:bg-surface-hover max-sm:flex-1 max-sm:justify-center"
      >
        {pending ? "Chấm bài" : "Xem lại"}
      </Link>
    </li>
  );
}

/** Placeholder rows with the shape of the real groups: no layout jump. */
export function QueueSkeleton() {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Đang tải hàng chờ chấm bài"
      data-testid="grading-skeleton"
    >
      {[0, 1].map((group) => (
        <div
          key={group}
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <div className="border-b border-border bg-surface-secondary px-4 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyQueue({ allGraded }: { allGraded: boolean }) {
  const Icon = allGraded ? Coffee : SearchX;
  return (
    <div
      data-testid="grading-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-secondary text-muted">
        <Icon aria-hidden size={30} />
      </span>
      <p className="text-base font-semibold">
        {allGraded
          ? "All essays graded! Take a break ☕"
          : "Không có bài nộp nào khớp bộ lọc."}
      </p>
      <p className="max-w-sm text-sm text-muted">
        {allGraded
          ? "Không còn bài tự luận nào đang chờ chấm. Bài mới sẽ xuất hiện ở đây khi học viên nộp."
          : "Thử đổi khóa học, bài quiz, trạng thái hoặc từ khóa tìm kiếm."}
      </p>
    </div>
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
  const [toast, setToast] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);
  const [confirming, setConfirming] = useState<{
    quizId: string;
    title: string;
    count: number;
  } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const publishOne = usePublishAttempt();
  const publishAll = usePublishQuizResults();
  const fail = (error: unknown) =>
    setToast({
      tone: "error",
      message:
        error instanceof ApiError && error.status === 409
          ? "Bài này chưa chấm xong nên chưa thể công bố."
          : errorMessage(error),
    });

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
        <QueueSkeleton />
      ) : !groups.length ? (
        <EmptyQueue
          allGraded={
            status === "NEEDS_GRADING" &&
            !courseId &&
            !quizId &&
            !debouncedSearch.trim()
          }
        />
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
                {group.unpublished ? (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      setConfirming({
                        quizId: group.key,
                        title: group.quizTitle,
                        count: group.unpublished,
                      })
                    }
                  >
                    Publish All Graded Results ({group.unpublished})
                  </Button>
                ) : null}
              </header>
              <ul className="divide-y divide-border">
                {group.items.map((item) => (
                  <Row
                    key={item.attemptId}
                    item={item}
                    publishing={
                      publishOne.isPending &&
                      publishOne.variables === item.attemptId
                    }
                    onPublish={(attemptId) =>
                      publishOne.mutate(attemptId, {
                        onSuccess: () =>
                          setToast({
                            tone: "info",
                            message: "Đã công bố kết quả cho học viên.",
                          }),
                        onError: fail,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {confirming ? (
        <Dialog
          title="Công bố kết quả?"
          description={`Công bố ${confirming.count} kết quả đã chấm của “${confirming.title}”. Học viên sẽ thấy điểm, nhận xét và (theo chính sách xem đáp án) đáp án của mình.`}
          busy={publishAll.isPending}
          onClose={() => setConfirming(null)}
        >
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={publishAll.isPending}
              onClick={() => setConfirming(null)}
            >
              Hủy
            </Button>
            <Button
              loading={publishAll.isPending}
              loadingLabel="Đang công bố…"
              onClick={() =>
                publishAll.mutate(confirming.quizId, {
                  onSuccess: (result) => {
                    setConfirming(null);
                    setToast({
                      tone: "info",
                      message: `Đã công bố ${result.publishedCount} kết quả.${
                        result.stillNeedGradingCount
                          ? ` Còn ${result.stillNeedGradingCount} bài chưa chấm xong.`
                          : ""
                      }`,
                    });
                  },
                  onError: (error) => {
                    setConfirming(null);
                    fail(error);
                  },
                })
              }
            >
              Công bố
            </Button>
          </div>
        </Dialog>
      ) : null}
      {toast ? (
        <Toast tone={toast.tone} message={toast.message} onClose={closeToast} />
      ) : null}

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
