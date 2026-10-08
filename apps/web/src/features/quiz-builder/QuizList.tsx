"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImportQuizDialog } from "@/features/content-import/ImportQuizDialog";
import { Failure } from "@/features/instructor/shared";
import { quizKey, quizzesKey, useQuizList } from "./api";
import { SCOPES } from "./model";

const STATUS = {
  DRAFT: { tone: "warning", label: "Bản nháp" },
  PUBLISHED: { tone: "success", label: "Đã xuất bản" },
  ARCHIVED: { tone: "neutral", label: "Đã lưu trữ" },
} as const;
const SCOPE_LABEL = Object.fromEntries(
  SCOPES.map(({ value, label }) => [value, label]),
);

export function QuizList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const list = useQuizList({ page, search, status });
  const router = useRouter();
  const client = useQueryClient();
  const pagination = list.data?.pagination;

  return (
    <>
      <div className="instructor-page-heading">
        <div>
          <p className="instructor-eyebrow">ASSESSMENT</p>
          <h1>Quizzes</h1>
          <p>Tạo bài kiểm tra cho bài học, chương, khóa học hoặc độc lập.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <FileUp aria-hidden size={16} className="mr-1" /> Import từ file
          </Button>
          <Link
            href="/instructor/quizzes/create"
            className="instructor-primary-link"
          >
            <Plus aria-hidden size={16} className="mr-1" /> Tạo quiz
          </Link>
        </div>
      </div>

      {importing ? (
        <ImportQuizDialog
          onClose={() => setImporting(false)}
          onImported={(quiz) => {
            client.setQueryData(quizKey(quiz.id), quiz);
            void client.invalidateQueries({ queryKey: quizzesKey });
            router.push(`/instructor/quizzes/${quiz.id}/edit`);
          }}
        />
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm font-medium">
          Tìm kiếm
          <Input
            className="mt-2"
            value={search}
            placeholder="Tiêu đề hoặc slug"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="block text-sm font-medium sm:w-56">
          Trạng thái
          <Select
            className="mt-2"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Đang dùng (trừ lưu trữ)</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đã xuất bản</option>
            <option value="ARCHIVED">Đã lưu trữ</option>
          </Select>
        </label>
      </div>

      {list.error ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : list.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Đang tải danh sách quiz"
          className="space-y-2"
        >
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : !list.data.quizzes.length ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
          Chưa có bài quiz nào.{" "}
          <Link
            href="/instructor/quizzes/create"
            className="text-primary underline"
          >
            Tạo quiz đầu tiên
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {list.data.quizzes.map((quiz) => (
            <li key={quiz.id}>
              <Link
                href={`/instructor/quizzes/${quiz.id}/edit`}
                className="flex flex-col gap-2 p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {quiz.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {SCOPE_LABEL[quiz.scope]} · {quiz.questionCount} câu hỏi · v
                    {quiz.version}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {quiz.isRequired ? <Badge tone="info">Bắt buộc</Badge> : null}
                  <Badge tone={STATUS[quiz.status].tone}>
                    {STATUS[quiz.status].label}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-end gap-2 text-sm"
          aria-label="Phân trang"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
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
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </nav>
      ) : null}
    </>
  );
}
