import type { AuthoredPost, BlogPostStatus } from "./types";

export const STATUS_LABELS: Record<
  BlogPostStatus,
  { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }
> = {
  DRAFT: { label: "Bản nháp", tone: "warning" },
  PENDING_REVIEW: { label: "Chờ duyệt", tone: "info" },
  PUBLISHED: { label: "Đã xuất bản", tone: "success" },
  HIDDEN: { label: "Đã ẩn", tone: "danger" },
  ARCHIVED: { label: "Đã lưu trữ", tone: "neutral" },
};

type Viewer = { id: string; isAdmin: boolean };

/**
 * What the viewer may do with a post, mirroring BlogPostsService: authors
 * edit their own drafts; admins edit anything not archived and run the
 * editorial steps on anyone's post.
 */
export function permissionsFor(post: Pick<AuthoredPost, "status" | "author">, viewer: Viewer) {
  const own = post.author.id === viewer.id;
  const { status } = post;
  return {
    own,
    edit: viewer.isAdmin ? status !== "ARCHIVED" : own && status === "DRAFT",
    remove: status === "DRAFT" && (own || viewer.isAdmin),
    submit: own && status === "DRAFT",
    withdraw: own && status === "PENDING_REVIEW",
    publish: viewer.isAdmin && status === "PENDING_REVIEW",
    reject: viewer.isAdmin && status === "PENDING_REVIEW",
    hide: viewer.isAdmin && status === "PUBLISHED",
  };
}

const date = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
export const formatDate = (value: string) => date.format(new Date(value));
