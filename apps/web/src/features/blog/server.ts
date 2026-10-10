import "server-only";
import { API_URL, ApiError, unwrapBody } from "@/lib/api";
import { toBlogList } from "./blog-list";
import type { BlogCategory, BlogList, BlogPostPage } from "./types";

/** Server-to-API base: the internal address inside Docker, else the public one. */
const apiOrigin = () =>
  (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/$/, "");

/** GET a public endpoint's raw body from the server; null on 404. */
async function getRaw(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ApiError(0, ["Không thể kết nối máy chủ. Vui lòng thử lại."]);
  }
  if (response.status === 404) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(response.status, ["Không thể tải bài viết."]);
  return body;
}

/** The payload: an envelope's `data`, else the body itself. */
const getPublic = async <T>(path: string) =>
  unwrapBody(await getRaw(path)) as T | null;

export async function fetchBlogList(
  page: number,
  category?: string,
): Promise<BlogList> {
  const query = new URLSearchParams({ page: String(page), limit: "12" });
  if (category) query.set("category", category);
  return toBlogList(await getRaw(`/api/v1/public/blog/posts?${query}`));
}

export const fetchBlogPost = (slug: string) =>
  getPublic<BlogPostPage>(
    `/api/v1/public/blog/posts/${encodeURIComponent(slug)}`,
  );

export async function fetchBlogCategories(): Promise<BlogCategory[]> {
  return (await getPublic<BlogCategory[]>("/api/v1/blog/categories")) ?? [];
}

export async function fetchBlogSitemap(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  return (await getPublic("/api/v1/public/blog/sitemap")) ?? [];
}
