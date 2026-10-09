"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Failure } from "@/features/instructor/shared";
import { formatDuration } from "@/features/quiz-player/ResultView";
import { cn } from "@/lib/utils";
import {
  attemptHref,
  resultHref,
  useMyAttempts,
  type HistoryScope,
  type MyAttempt,
} from "./api";

const TABS: ReadonlyArray<{ value: HistoryScope; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "standalone", label: "Quiz độc lập" },
  { value: "course", label: "Quiz khóa học" },
];
const SCOPE_LABEL: Record<MyAttempt["scope"], string> = {
  STANDALONE: "Standalone",
  COURSE: "Course",
  CHAPTER: "Chapter",
  LESSON: "Lesson",
};

type Badged = {
  tone: "success" | "danger" | "warning" | "info";
  label: string;
};

export function attemptBadge(attempt: MyAttempt): Badged {
  if (attempt.status === "IN_PROGRESS")
    return attempt.isExpired
      ? { tone: "warning", label: "Hết giờ (chờ chấm)" }
      : { tone: "info", label: "Đang làm" };
  if (attempt.status === "SUBMITTING")
    return { tone: "info", label: "Đang chấm" };
  if (attempt.status === "NEEDS_GRADING")
    return { tone: "warning", label: "Chờ chấm" };
  if (attempt.status === "TIMED_OUT")
    return attempt.isPassed
      ? { tone: "success", label: "Timed Out · Passed" }
      : { tone: "warning", label: "Timed Out" };
  if (attempt.status === "ABANDONED")
    return { tone: "warning", label: "Đã hủy" };
  return attempt.isPassed
    ? { tone: "success", label: "Passed" }
    : { tone: "danger", label: "Failed" };
}

/** Where the row's action leads: resume a running attempt, else its result. */
export function attemptAction(
  attempt: MyAttempt,
): { href: string; label: string } | null {
  const running = attempt.status === "IN_PROGRESS" && !attempt.isExpired;
  if (attempt.scope === "STANDALONE") {
    if (!attempt.quizSlug) return null;
    return running
      ? { href: attemptHref(attempt.quizSlug), label: "Tiếp tục" }
      : {
          href: resultHref(attempt.quizSlug, attempt.attemptId),
          label: "Xem kết quả",
        };
  }
  if (!attempt.courseSlug) return null;
  const base = `/learn/${encodeURIComponent(attempt.courseSlug)}/quiz/${encodeURIComponent(attempt.quizId)}`;
  return running
    ? { href: base, label: "Tiếp tục" }
    : {
        href: `${base}?result=${encodeURIComponent(attempt.attemptId)}`,
        label: "Xem kết quả",
      };
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

export function MyQuizAttempts() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = (TABS.find(({ value }) => value === params.get("scope"))
    ?.value ?? "all") as HistoryScope;
  const pageParam = Number(params.get("page"));
  const page = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const history = useMyAttempts(scope, page);
  const go = (next: { scope?: HistoryScope; page?: number }) => {
    const query = new URLSearchParams();
    const nextScope = next.scope ?? scope;
    const nextPage = next.page ?? 1;
    if (nextScope !== "all") query.set("scope", nextScope);
    if (nextPage > 1) query.set("page", String(nextPage));
    router.replace(query.size ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  const pagination = history.data?.pagination;

  return (
    <main className="container space-y-6 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Lịch sử làm bài
        </h1>
        <p className="mt-1 text-muted">
          Mọi lượt làm quiz của bạn, trong và ngoài khóa học.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Lọc theo loại quiz"
        className="flex flex-wrap gap-2"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={scope === tab.value}
            onClick={() => go({ scope: tab.value })}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              scope === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong hover:bg-surface-hover",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {history.error ? (
        <Failure error={history.error} retry={() => void history.refetch()} />
      ) : history.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !history.data.attempts.length ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted">
          Chưa có lượt làm bài nào.{" "}
          <Link href="/quizzes" className="text-primary underline">
            Khám phá quiz
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-surface-secondary text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Bài thi
                </th>
                <th scope="col" className="px-4 py-3">
                  Scope
                </th>
                <th scope="col" className="px-4 py-3">
                  Ngày làm
                </th>
                <th scope="col" className="px-4 py-3">
                  Thời gian
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Điểm
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Tỷ lệ
                </th>
                <th scope="col" className="px-4 py-3">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.data.attempts.map((attempt) => {
                const badge = attemptBadge(attempt);
                const action = attemptAction(attempt);
                return (
                  <tr
                    key={attempt.attemptId}
                    data-testid={`attempt-row-${attempt.attemptId}`}
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {attempt.quizTitle}
                      </span>
                      <span className="block text-xs text-muted">
                        Lượt {attempt.attemptNumber}
                        {attempt.courseTitle ? ` · ${attempt.courseTitle}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          attempt.scope === "STANDALONE" ? "info" : "neutral"
                        }
                      >
                        {SCOPE_LABEL[attempt.scope]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {dateTime(attempt.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDuration(attempt.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {attempt.earnedPoints === null
                        ? "—"
                        : `${attempt.earnedPoints}/${attempt.totalPoints}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {attempt.percentage === null
                        ? "—"
                        : `${attempt.percentage}%`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {action ? (
                        <Link
                          href={action.href}
                          className="font-semibold text-primary hover:underline"
                        >
                          {action.label}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <nav
          aria-label="Phân trang"
          className="flex items-center justify-end gap-3 text-sm"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => go({ page: page - 1 })}
          >
            Trước
          </Button>
          <span className="tabular-nums">
            {page}/{pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => go({ page: page + 1 })}
          >
            Sau
          </Button>
        </nav>
      ) : null}
    </main>
  );
}
