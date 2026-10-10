import type { InfiniteData } from "@tanstack/react-query";
import type { BlogComment, CommentOutcome, CommentPage } from "./types";

export type Thread = InfiniteData<CommentPage, unknown>;

/** Shown at once on the author's screen; the server's answer replaces it. */
export function withSending(thread: Thread, temp: BlogComment): Thread {
  const [first, ...rest] = thread.pages;
  if (!first) return thread;
  return {
    ...thread,
    pages: [{ ...first, pending: [...first.pending, temp] }, ...rest],
  };
}

/** Drops the stand-in (the send failed or was rejected). */
export function withoutComment(thread: Thread, id: string): Thread {
  return {
    ...thread,
    pages: thread.pages.map((page) => ({
      ...page,
      pending: page.pending.filter((comment) => comment.id !== id),
      comments: page.comments.filter((comment) => comment.id !== id),
    })),
  };
}

/**
 * Puts the server's verdict in place of the stand-in: published comments
 * join the end of the thread (when its last page is loaded), pending ones
 * stay with the author's own, rejected ones go.
 */
export function settle(
  thread: Thread,
  tempId: string,
  outcome: CommentOutcome,
): Thread {
  const without = withoutComment(thread, tempId);
  const comment = { ...outcome.comment, status: outcome.status };
  if (outcome.status === "REJECTED") return without;
  if (outcome.status === "PENDING") return withSending(without, comment);
  const pages = without.pages.map((page) => ({
    ...page,
    total: page.total + 1,
  }));
  const last = pages.at(-1);
  if (last && last.page >= last.totalPages)
    pages[pages.length - 1] = { ...last, comments: [...last.comments, comment] };
  return { ...without, pages };
}

/** Every approved comment loaded so far, then the viewer's pending ones. */
export function visibleComments(thread: Thread | undefined) {
  const pages = thread?.pages ?? [];
  return {
    published: pages.flatMap((page) => page.comments),
    mine: pages[0]?.pending ?? [],
    total: pages[0]?.total ?? 0,
  };
}
