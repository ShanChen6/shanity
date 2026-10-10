import { API_URL, ApiError, api, errorMessage } from "@/lib/api";
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

export type AuthoredPostPage = {
  items: AuthoredPost[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/**
 * `/api/v1/blog/*` is the blog controller's own path, not an alias in
 * api-v1-routes.ts, so it answers without the v1 envelope: the list is the
 * service's `{ items, page, limit, total, totalPages }` as is. An envelope
 * (should the route become an alias) is accepted too.
 */
export function toPostPage(body: unknown): AuthoredPostPage {
  if (body && typeof body === "object") {
    const flat = body as Partial<AuthoredPostPage>;
    if (Array.isArray(flat.items) && typeof flat.total === "number")
      return flat as AuthoredPostPage;
    const envelope = body as { data?: unknown; meta?: Omit<AuthoredPostPage, "items"> };
    if (Array.isArray(envelope.data) && envelope.meta)
      return { items: envelope.data as AuthoredPost[], ...envelope.meta };
  }
  throw new ApiError(502, ["Dữ liệu danh sách bài viết không hợp lệ."]);
}

export async function fetchPosts(
  { status, mine, page }: { status?: BlogPostStatus | ""; mine?: boolean; page: number },
  signal?: AbortSignal,
): Promise<AuthoredPostPage> {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) query.set("status", status);
  if (mine) query.set("mine", "true");
  // `api` returns a body without an envelope unchanged.
  return toPostPage(await api<unknown>(`${BASE}?${query}`, { signal }));
}

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

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Uploads a cover or inline image. The API stores it re-encoded and answers
 * with a path on its own origin; posts keep the absolute URL (the cover
 * field requires one, and Markdown is read on the web origin).
 */
export async function uploadImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type))
    throw new ApiError(415, ["BLOG_IMAGE_TYPE"], { code: "BLOG_IMAGE_TYPE" });
  if (file.size > MAX_IMAGE_BYTES)
    throw new ApiError(413, ["BLOG_IMAGE_TOO_LARGE"], { code: "BLOG_IMAGE_TOO_LARGE" });
  const body = new FormData();
  body.append("file", file);
  const image = await api<{ path: string; width: number; height: number }>(
    "/api/v1/blog/images",
    { method: "POST", body, signal: AbortSignal.timeout(60_000) },
  );
  return { ...image, url: `${API_URL}${image.path}` };
}

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
      case "BLOG_IMAGE_TOO_LARGE":
        return "Ảnh quá lớn. Vui lòng chọn ảnh tối đa 5 MB.";
      case "BLOG_IMAGE_TYPE":
        return "Chỉ hỗ trợ ảnh JPEG, PNG, WebP hoặc GIF tĩnh.";
      case "BLOG_IMAGE_INVALID":
        return "Không đọc được ảnh này. Hãy thử ảnh khác (tối đa 40 megapixel, không phải ảnh động).";
      case "BLOG_IMAGE_REQUIRED":
        return "Chưa chọn ảnh.";
      case "BLOG_POST_NOT_FOUND":
        return "Không tìm thấy bài viết, hoặc bạn không có quyền xem.";
    }
    if (error.status === 404) return "Không tìm thấy bài viết, hoặc bạn không có quyền xem.";
  }
  return errorMessage(error);
}
