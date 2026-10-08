"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, ListChecks, Search, Target, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Failure } from "@/features/instructor/shared";
import {
  DIFFICULTY_LABEL,
  quizHref,
  useStandaloneList,
  type Difficulty,
  type HubFilters,
  type StandaloneSummary,
} from "./api";

const DIFFICULTIES = Object.keys(DIFFICULTY_LABEL) as Difficulty[];

function readFilters(params: URLSearchParams): HubFilters {
  const page = Number(params.get("page"));
  const difficulty = params.get("difficulty") as Difficulty | null;
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    search: params.get("q") ?? "",
    difficulty:
      difficulty && DIFFICULTIES.includes(difficulty) ? difficulty : "",
    tag: params.get("tag") ?? "",
  };
}

export function QuizHub() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.search);
  const list = useStandaloneList(filters);

  const navigate = (patch: Partial<HubFilters>) => {
    const next = { ...filters, page: 1, ...patch };
    const query = new URLSearchParams();
    if (next.search) query.set("q", next.search);
    if (next.difficulty) query.set("difficulty", next.difficulty);
    if (next.tag) query.set("tag", next.tag);
    if (next.page > 1) query.set("page", String(next.page));
    router.replace(query.size ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // Debounced keyword search.
  useEffect(() => {
    if (search === filters.search) return;
    const timer = window.setTimeout(
      () => navigate({ search: search.trim() }),
      350,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pagination = list.data?.pagination;
  return (
    <main className="container space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Quiz độc lập
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Thử thách kiến thức
          </h1>
          <p className="mt-1 text-muted">
            Làm bài kiểm tra bất kỳ lúc nào — không cần đăng ký khóa học.
          </p>
        </div>
        <Link
          href="/quiz-attempts"
          className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          Lịch sử làm bài
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative block">
          <span className="sr-only">Tìm kiếm quiz</span>
          <Search
            aria-hidden
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={search}
            placeholder="Tìm theo tên, slug hoặc tag…"
            className="pl-10"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="sr-only">Độ khó</span>
          <Select
            value={filters.difficulty}
            aria-label="Độ khó"
            onChange={(event) =>
              navigate({ difficulty: event.target.value as Difficulty | "" })
            }
          >
            <option value="">Mọi độ khó</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {DIFFICULTY_LABEL[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {filters.tag ? (
        <p className="flex items-center gap-2 text-sm">
          Tag:
          <button
            type="button"
            onClick={() => navigate({ tag: "" })}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground"
            aria-label={`Bỏ lọc tag ${filters.tag}`}
          >
            #{filters.tag} <X aria-hidden size={14} />
          </button>
        </p>
      ) : null}

      {list.error ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : list.isPending ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-52 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : !list.data.quizzes.length ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">
          Không tìm thấy bài quiz phù hợp.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.quizzes.map((quiz) => (
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              onTag={(tag) => navigate({ tag })}
            />
          ))}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <nav
          aria-label="Phân trang"
          className="flex items-center justify-center gap-3 text-sm"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => navigate({ ...filters, page: filters.page - 1 })}
          >
            Trước
          </Button>
          <span className="tabular-nums">
            Trang {filters.page}/{pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= pagination.totalPages}
            onClick={() => navigate({ ...filters, page: filters.page + 1 })}
          >
            Sau
          </Button>
        </nav>
      ) : null}
    </main>
  );
}

function QuizCard({
  quiz,
  onTag,
}: {
  quiz: StandaloneSummary;
  onTag: (tag: string) => void;
}) {
  return (
    <li className="flex flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">Standalone</Badge>
        {quiz.difficulty ? (
          <Badge tone="neutral">{DIFFICULTY_LABEL[quiz.difficulty]}</Badge>
        ) : null}
      </div>
      <h2 className="mt-3 text-lg font-semibold leading-snug">
        <Link href={quizHref(quiz.slug)} className="hover:text-primary">
          {quiz.title}
        </Link>
      </h2>
      {quiz.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {quiz.description}
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          <Clock aria-hidden size={15} className="text-muted" />
          <dt className="sr-only">Thời gian</dt>
          <dd>
            {quiz.durationMinutes
              ? `${quiz.durationMinutes} phút`
              : "Không giới hạn"}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <ListChecks aria-hidden size={15} className="text-muted" />
          <dt className="sr-only">Số câu hỏi</dt>
          <dd>{quiz.totalQuestions} câu</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Target aria-hidden size={15} className="text-muted" />
          <dt className="sr-only">Điểm đạt</dt>
          <dd>Đạt {quiz.passingScore}%</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users aria-hidden size={15} className="text-muted" />
          <dt className="sr-only">Lượt làm bài</dt>
          <dd>{quiz.totalAttempts} lượt làm</dd>
        </div>
      </dl>
      {quiz.tags.length ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tag">
          {quiz.tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onTag(tag)}
                className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-foreground-secondary hover:bg-surface-hover"
              >
                #{tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto pt-5">
        <Link
          href={quizHref(quiz.slug)}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Xem chi tiết
        </Link>
      </div>
    </li>
  );
}
