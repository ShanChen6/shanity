"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { commentKeys, decideComment, fetchCommentQueue } from "./api";
import type { QueuedComment } from "./types";

const TABS = [
  { status: "PENDING", label: "Chờ duyệt" },
  { status: "REJECTED", label: "Đã chặn" },
  { status: "APPROVED", label: "Đã đăng" },
] as const;

/** Why the pipeline did what it did, in words. */
export const REASON_LABELS: Record<string, string> = {
  SUSPICIOUS: "AI đánh giá nghi vấn (0.3–0.7)",
  UNTRUSTED_AUTHOR: "Tài khoản mới hoặc chưa đủ uy tín",
  AI_UNAVAILABLE: "Không gọi được dịch vụ AI",
  TOXIC: "AI đánh giá độc hại (> 0.7)",
  SPAM_LINK: "Chứa liên kết ngoài",
  CONTACT_INFO: "Chứa số điện thoại / Zalo / Telegram",
  PROFANITY: "Chứa từ ngữ tục tĩu",
  BLOCKED_TERM: "Chứa từ bị chặn",
  REPEATED_TEXT: "Lặp ký tự / từ ngữ",
  DUPLICATE: "Gửi trùng lặp",
  ADMIN_REJECTED: "Quản trị viên từ chối",
};

const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

/** The comments the moderation pipeline left to a person. */
export function AdminCommentQueue() {
  const [status, setStatus] = useState<(typeof TABS)[number]["status"]>("PENDING");
  const client = useQueryClient();
  const toasts = useToast();
  const query = useQuery({
    queryKey: commentKeys.queue(status),
    queryFn: ({ signal }) => fetchCommentQueue(status, 1, signal),
    refetchInterval: 30_000,
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      decideComment(id, decision),
    onSuccess: (_, { decision }) => {
      toasts.success(decision === "approve" ? "Đã đăng bình luận." : "Đã từ chối bình luận.");
      void client.invalidateQueries({ queryKey: ["blog", "comment-queue"] });
    },
    onError: (error) => toasts.error(errorMessage(error)),
  });

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Trạng thái" className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            role="tab"
            aria-selected={status === tab.status}
            onClick={() => setStatus(tab.status)}
            className={cn(
              "min-h-9 rounded-full border px-4 text-sm font-medium",
              status === tab.status
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border-strong hover:bg-surface-hover",
            )}
          >
            {tab.label}
            {tab.status === status && query.data ? ` (${query.data.total})` : ""}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <p role="status" className="text-sm text-muted">Đang tải…</p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-danger-foreground">{errorMessage(query.error)}</p>
      ) : query.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center" data-testid="comment-queue-empty">
          <ShieldCheck className="size-10 text-success" aria-hidden="true" />
          <p className="font-semibold">Không có bình luận nào ở đây</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {query.data.items.map((comment) => (
            <QueueItem
              key={comment.id}
              comment={comment}
              busy={decide.isPending && decide.variables?.id === comment.id}
              onDecide={(decision) => decide.mutate({ id: comment.id, decision })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueItem({
  comment,
  busy,
  onDecide,
}: {
  comment: QueuedComment;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  const reason = comment.rejectionReason;
  const categories = Object.entries(comment.moderation.categories ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return (
    <li className="rounded-lg border border-border bg-surface p-4" data-testid="queued-comment">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{comment.author.name}</span>
        <span className="text-muted">trong</span>
        <Link href={`/blog/${encodeURIComponent(comment.post.slug)}`} className="font-medium text-primary hover:underline">
          {comment.post.title}
        </Link>
        <span className="text-xs text-muted">{date.format(new Date(comment.createdAt))}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-surface-secondary px-3 py-2">
        {comment.content}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {reason && <Badge tone="warning">{REASON_LABELS[reason] ?? reason}</Badge>}
        {comment.toxicityScore !== null && (
          <Badge tone="neutral">Điểm độc hại: {comment.toxicityScore.toFixed(2)}</Badge>
        )}
        {categories.map(([name, score]) => (
          <span key={name} className="text-muted">
            {name} {score.toFixed(2)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {comment.status !== "REJECTED" && (
          <Button size="sm" variant="outline" loading={busy} onClick={() => onDecide("reject")}>
            Từ chối
          </Button>
        )}
        {comment.status !== "APPROVED" && (
          <Button size="sm" loading={busy} onClick={() => onDecide("approve")}>
            Duyệt & đăng
          </Button>
        )}
      </div>
    </li>
  );
}
