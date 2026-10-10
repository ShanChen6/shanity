"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/session-provider";
import { cn } from "@/lib/utils";
import { blogErrorMessage, fetchPosts, postKeys } from "./api";
import { PostActions } from "./PostActions";
import { STATUS_LABELS, formatDate } from "./status";
import type { AuthoredPost, BlogPostStatus } from "./types";

type Tab = { status: BlogPostStatus | ""; label: string; mine?: boolean };

const AUTHOR_TABS: Tab[] = [
  { status: "", label: "Tất cả" },
  { status: "DRAFT", label: "Bản nháp" },
  { status: "PENDING_REVIEW", label: "Chờ duyệt" },
  { status: "PUBLISHED", label: "Đã xuất bản" },
  { status: "HIDDEN", label: "Đã ẩn" },
];

/** Admins land on the review queue; "Bài của tôi" is their own writing. */
const ADMIN_TABS: Tab[] = [
  { status: "PENDING_REVIEW", label: "Chờ duyệt" },
  { status: "PUBLISHED", label: "Đã xuất bản" },
  { status: "HIDDEN", label: "Đã ẩn" },
  { status: "DRAFT", label: "Bản nháp" },
  { status: "", label: "Bài của tôi", mine: true },
];

/**
 * The blog workspace: an author's own posts, or for admins everyone's,
 * with the review queue first. `basePath` is where new/edit pages live.
 */
export function PostList({ basePath }: { basePath: string }) {
  const { user } = useSession();
  const isAdmin = user?.roles.includes("admin") ?? false;
  const viewer = { id: user?.id ?? "", isAdmin };
  const tabs = isAdmin ? ADMIN_TABS : AUTHOR_TABS;
  const [tabIndex, setTabIndex] = useState(0);
  const [page, setPage] = useState(1);
  const tab = tabs[tabIndex]!;
  const mine = !isAdmin || tab.mine === true;

  const query = useQuery({
    queryKey: postKeys.list(tab.status, mine, page),
    queryFn: ({ signal }) => fetchPosts({ status: tab.status, mine, page }, signal),
    enabled: Boolean(user),
  });

  const newLink = (
    <Link
      href={`${basePath}/new`}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
    >
      <Plus aria-hidden className="size-4" /> Viết bài mới
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? "Blog" : "Bài viết của tôi"}
        description={
          isAdmin
            ? "Duyệt bài giảng viên gửi lên, quản lý bài đã xuất bản và viết bài của riêng bạn."
            : "Viết bài chia sẻ kiến thức. Bài được quản trị viên duyệt trước khi lên blog."
        }
        actions={newLink}
      />

      <div role="tablist" aria-label="Lọc bài viết" className="flex flex-wrap gap-2">
        {tabs.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={index === tabIndex}
            onClick={() => {
              setTabIndex(index);
              setPage(1);
            }}
            className={cn(
              "min-h-9 rounded-full border px-4 text-sm font-medium",
              index === tabIndex
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border-strong hover:bg-surface-hover",
            )}
          >
            {item.label}
            {index === tabIndex && query.data ? ` (${query.data.total})` : ""}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div role="status" aria-busy="true" aria-label="Đang tải bài viết" className="space-y-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-20 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <p className="text-sm text-danger-foreground">{blogErrorMessage(query.error)}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : query.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
          <FileText aria-hidden className="size-10 text-muted" />
          <p className="font-semibold">
            {tab.status === "PENDING_REVIEW" && isAdmin
              ? "Không có bài nào chờ duyệt"
              : "Chưa có bài viết nào ở đây"}
          </p>
          {(!isAdmin || tab.mine) && newLink}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {query.data.items.map((post) => (
              <PostRow key={post.id} post={post} basePath={basePath} viewer={viewer} />
            ))}
          </ul>
          {query.data.totalPages > 1 && (
            <nav aria-label="Phân trang" className="flex items-center justify-end gap-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trang trước
              </Button>
              <span>
                {page} / {query.data.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= query.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PostRow({
  post,
  basePath,
  viewer,
}: {
  post: AuthoredPost;
  basePath: string;
  viewer: { id: string; isAdmin: boolean };
}) {
  const status = STATUS_LABELS[post.status];
  const when =
    post.status === "PUBLISHED" && post.publishedAt
      ? `Xuất bản ${formatDate(post.publishedAt)}`
      : post.status === "PENDING_REVIEW" && post.submittedAt
        ? `Gửi duyệt ${formatDate(post.submittedAt)}`
        : `Cập nhật ${formatDate(post.updatedAt)}`;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4" data-testid="authored-post">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`${basePath}/${post.id}/edit`}
            className="min-w-0 truncate font-semibold hover:text-primary hover:underline"
          >
            {post.title}
          </Link>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          {[
            viewer.isAdmin && !(post.author.id === viewer.id) ? post.author.name : null,
            post.category?.name ?? "Chưa chọn chủ đề",
            when,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {post.status === "PUBLISHED" && (
          <Link
            href={`/blog/${encodeURIComponent(post.slug)}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Xem trên blog
          </Link>
        )}
        <Link
          href={`${basePath}/${post.id}/edit`}
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-xs font-semibold hover:bg-surface-hover"
        >
          {post.status === "DRAFT" || viewer.isAdmin ? "Mở" : "Xem"}
        </Link>
        <PostActions post={post} viewer={viewer} />
      </div>
    </li>
  );
}
