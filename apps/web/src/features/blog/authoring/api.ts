import { ApiError, api, apiFlatPage, errorMessage } from "@/lib/api";
import type { BlogCategory } from "../types";
import type {
  AuthoredPost,
  AuthoredPostDetail,
  BlogPostStatus,
  PostAction,
  PostInput,
} from "./types";

const enc = encodeURIComponent;
const BASE = "/api/v1/blog/posts";

export const postKeys = {
  all: ["blog", "authoring"] as const,
  list: (status: string, mine: boolean, page: number) =>
    ["blog", "authoring", "list", status, mine, page] as const,
  detail: (id: string) => ["blog", "authoring", "post", id] as const,
  categories: ["blog", "categories"] as const,
};

export const fetchPosts = (
  { status, mine, page }: { status?: BlogPostStatus | ""; mine?: boolean; page: number },
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) query.set("status", status);
  if (mine) query.set("mine", "true");
  return apiFlatPage<AuthoredPost>(`${BASE}?${query}`, { signal });
};

export const fetchPost = (id: string, signal?: AbortSignal) =>
  api<AuthoredPostDetail>(`${BASE}/${enc(id)}`, { signal });

export const createPost = (input: PostInput) =>
  api<AuthoredPostDetail>(BASE, { method: "POST", body: JSON.stringify(input) });

export const updatePost = (id: string, input: Partial<PostInput>) =>
  api<AuthoredPostDetail>(`${BASE}/${enc(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deletePost = (id: string) =>
  api<void>(`${BASE}/${enc(id)}`, { method: "DELETE" });

export const runPostAction = (id: string, action: PostAction, note?: string) =>
  api<AuthoredPostDetail>(`${BASE}/${enc(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
  });

export const fetchCategories = (signal?: AbortSignal) =>
  api<BlogCategory[]>("/api/v1/blog/categories", { signal });

export const createCategory = (name: string) =>
  api<BlogCategory>("/api/v1/blog/categories", {
    method: "POST",
    body: JSON.stringify({ name: name.trim() }),
  });

const MISSING_LABELS: Record<string, string> = {
  content: "nội dung",
  categoryId: "chủ đề",
};

/** The blog API's error codes, in words; anything else falls back. */
export function blogErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "BLOG_SLUG_TAKEN":
        return "Đường dẫn (slug) này đã có bài khác dùng. Hãy chọn đường dẫn khác.";
      case "BLOG_SLUG_FROZEN":
        return "Bài đã từng xuất bản nên không thể đổi đường dẫn.";
      case "BLOG_POST_NOT_EDITABLE":
        return "Bài không còn ở trạng thái cho phép chỉnh sửa. Hãy tải lại trang.";
      case "BLOG_POST_HAS_HISTORY":
        return "Bài đã qua kiểm duyệt nên không thể xóa.";
      case "BLOG_POST_INVALID_TRANSITION":
        return "Trạng thái bài viết đã thay đổi. Hãy tải lại trang.";
      case "BLOG_POST_AUTHOR_ONLY":
        return "Chỉ tác giả mới thực hiện được thao tác này.";
      case "BLOG_POST_INCOMPLETE": {
        const missing = Array.isArray(error.data.missing)
          ? (error.data.missing as string[]).map((field) => MISSING_LABELS[field] ?? field)
          : [];
        return missing.length
          ? `Bài còn thiếu ${missing.join(" và ")} nên chưa thể gửi duyệt.`
          : "Bài chưa đủ thông tin để gửi duyệt.";
      }
      case "BLOG_CATEGORY_NOT_FOUND":
        return "Chủ đề đã chọn không còn tồn tại.";
      case "BLOG_CATEGORY_SLUG_TAKEN":
        return "Chủ đề này đã có.";
      case "BLOG_POST_NOT_FOUND":
        return "Không tìm thấy bài viết, hoặc bạn không có quyền xem.";
    }
    if (error.status === 404) return "Không tìm thấy bài viết, hoặc bạn không có quyền xem.";
  }
  return errorMessage(error);
}
