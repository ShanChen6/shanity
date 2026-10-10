import { api, apiFlatPage } from "@/lib/api";
import type { CommentOutcome, CommentPage, QueuedComment } from "./types";

const enc = encodeURIComponent;

export const commentKeys = {
  thread: (slug: string, viewerId: string | null) =>
    ["blog", "comments", slug, viewerId] as const,
  queue: (status: string) => ["blog", "comment-queue", status] as const,
};

export const fetchComments = (slug: string, page: number, signal?: AbortSignal) =>
  api<CommentPage>(`/api/v1/blog/posts/${enc(slug)}/comments?page=${page}`, {
    signal,
  });

export const submitComment = (slug: string, content: string) =>
  api<CommentOutcome>(`/api/v1/blog/posts/${enc(slug)}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

export const fetchCommentQueue = (status: string, page: number, signal?: AbortSignal) =>
  apiFlatPage<QueuedComment>(
    `/api/v1/admin/comments?status=${status}&page=${page}&limit=20`,
    { signal },
  );

export const decideComment = (
  id: string,
  decision: "approve" | "reject",
  reason?: string,
) =>
  api<{ id: string; status: string }>(`/api/v1/admin/comments/${enc(id)}/${decision}`, {
    method: "PATCH",
    body: JSON.stringify(reason ? { reason } : {}),
  });
