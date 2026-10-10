"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session-provider";
import { avatarSrc } from "@/features/chat/chat-format";
import { ApiError, errorMessage } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { commentKeys, fetchComments, submitComment } from "./api";
import {
  settle,
  visibleComments,
  withSending,
  withoutComment,
  type Thread,
} from "./comments-model";
import type { BlogComment, CommentPage } from "./types";

export const COMMENT_MAX_LENGTH = 2000;
/** While a comment of yours awaits review, the thread is re-read this often. */
export const PENDING_POLL_MS = 15_000;

const date = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * A post's comments. Your own comment appears the moment you send it; one
 * the moderation pipeline holds stays visible to you (and only you) with a
 * "waiting for review" badge, and turns public by itself once approved.
 */
export function BlogCommentSection({ slug }: { slug: string }) {
  const { user, status: session } = useSession();
  const client = useQueryClient();
  const key = commentKeys.thread(slug, user?.id ?? null);
  const formId = useId();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetchComments(slug, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last: CommentPage) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    enabled: session !== "loading",
    // Watch your own held comments until a moderator decides.
    refetchInterval: (q) =>
      (q.state.data?.pages[0]?.pending.length ?? 0) > 0 ? PENDING_POLL_MS : false,
  });
  const { published, mine, total } = visibleComments(query.data);
  const content = draft.trim();
  const tooLong = draft.length > COMMENT_MAX_LENGTH;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!user || !content || tooLong || sending) return;
    const temp: BlogComment = {
      id: `sending-${Date.now()}`,
      content,
      status: "SENDING",
      createdAt: new Date().toISOString(),
      author: { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl },
    };
    const update = (change: (thread: Thread) => Thread) =>
      client.setQueryData<Thread>(key, (thread) => (thread ? change(thread) : thread));
    await client.cancelQueries({ queryKey: key });
    update((thread) => withSending(thread, temp));
    setDraft("");
    setSending(true);
    setNotice(null);
    try {
      const outcome = await submitComment(slug, content);
      update((thread) => settle(thread, temp.id, outcome));
      if (outcome.status === "REJECTED") {
        setDraft(content); // let them fix it
        setNotice({ tone: "error", text: outcome.message });
      } else if (outcome.status === "APPROVED") {
        setNotice({ tone: "success", text: outcome.message });
      }
    } catch (error) {
      update((thread) => withoutComment(thread, temp.id));
      setDraft(content);
      setNotice({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 429
            ? "Bạn bình luận quá nhanh. Vui lòng chờ một lát rồi thử lại."
            : errorMessage(error),
      });
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+Enter sends; Enter alone is a new line in a long comment.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send();
  }

  return (
    <section aria-labelledby={`${formId}-title`} className="mt-12 border-t border-border pt-8">
      <h2 id={`${formId}-title`} className="flex items-center gap-2 font-heading text-h3 font-semibold">
        <MessageSquare className="size-5 text-primary" aria-hidden="true" />
        Bình luận {total > 0 && <span className="text-muted">({total})</span>}
      </h2>

      {user ? (
        <form onSubmit={(event) => void send(event)} className="mt-5 space-y-2">
          <label htmlFor={`${formId}-input`} className="sr-only">
            Viết bình luận
          </label>
          <textarea
            id={`${formId}-input`}
            ref={input}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Chia sẻ suy nghĩ hoặc câu hỏi của bạn…"
            aria-invalid={tooLong || undefined}
            className={cn(
              "w-full rounded-md border border-input bg-surface px-3.5 py-3 text-base placeholder:text-muted hover:border-input-hover focus-visible:border-input-focus",
              tooLong && "border-danger",
            )}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              Bình luận được kiểm duyệt tự động. Không chèn liên kết quảng cáo hay số điện thoại.
            </span>
            <span className={cn("shrink-0", tooLong && "font-semibold text-danger-foreground")}>
              {draft.length}/{COMMENT_MAX_LENGTH}
            </span>
          </div>
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                notice.tone === "error"
                  ? "bg-danger-background text-danger-foreground"
                  : "bg-success-background text-success-foreground",
              )}
            >
              {notice.text}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!content || tooLong} loading={sending}>
              Gửi bình luận
            </Button>
          </div>
        </form>
      ) : session === "loading" ? null : (
        <Alert tone="info" className="mt-5">
          <Link href={loginUrl(`/blog/${encodeURIComponent(slug)}`)} className="font-semibold underline">
            Đăng nhập
          </Link>{" "}
          để tham gia bình luận.
        </Alert>
      )}

      {query.isPending && session !== "loading" ? (
        <p className="mt-6 text-sm text-muted" role="status">
          Đang tải bình luận…
        </p>
      ) : query.error ? (
        <p className="mt-6 text-sm text-danger-foreground" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : (
        <ol className="mt-6 space-y-5" aria-label="Danh sách bình luận">
          {published.map((comment) => (
            <CommentItem key={comment.id} comment={comment} own={comment.author.id === user?.id} />
          ))}
          {mine.map((comment) => (
            <CommentItem key={comment.id} comment={comment} own />
          ))}
          {published.length === 0 && mine.length === 0 && (
            <li className="text-sm text-muted">Chưa có bình luận nào. Hãy là người đầu tiên!</li>
          )}
        </ol>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          className="mt-5"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Xem thêm bình luận
        </Button>
      )}
    </section>
  );
}

function CommentItem({ comment, own }: { comment: BlogComment; own: boolean }) {
  const waiting = comment.status === "PENDING" || comment.status === "SENDING";
  return (
    <li
      className="flex gap-3"
      data-testid="blog-comment"
      data-status={comment.status}
    >
      <Avatar
        name={comment.author.name}
        src={avatarSrc(comment.author.avatarUrl)}
        unoptimized
        className="size-9 shrink-0"
      />
      <div className={cn("min-w-0 flex-1", waiting && "opacity-60")}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">
            {comment.author.name}
            {own && <span className="font-normal text-muted"> (bạn)</span>}
          </span>
          <time dateTime={comment.createdAt} className="text-xs text-muted">
            {date.format(new Date(comment.createdAt))}
          </time>
        </p>
        {/* Plain text: comments are never rendered as HTML or Markdown. */}
        <p className="mt-1 whitespace-pre-wrap break-words">{comment.content}</p>
        {comment.status === "PENDING" && (
          <Badge tone="warning" className="mt-2">
            Bình luận của bạn đang chờ kiểm duyệt
          </Badge>
        )}
        {comment.status === "SENDING" && (
          <Badge tone="neutral" className="mt-2">
            Đang gửi…
          </Badge>
        )}
      </div>
    </li>
  );
}
