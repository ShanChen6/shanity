import "server-only";
import { API_URL, ApiError, type PaginationMeta } from "@/lib/api";
import type {
  CatalogCourse,
  CatalogFilters,
  CourseCatalogResponse,
} from "./catalog-types";

/** The public course catalog, fetched from the server (internal API address in Docker). */
export async function fetchCatalog(
  filters: CatalogFilters,
): Promise<CourseCatalogResponse> {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  if (filters.search) params.set("search", filters.search);
  if (filters.instructorId) params.set("instructorId", filters.instructorId);

  const origin = process.env.API_INTERNAL_URL ?? API_URL;
  let response: Response;
  try {
    response = await fetch(
      `${origin.replace(/\/$/, "")}/api/v1/public/courses?${params}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new ApiError(0, ["Không thể kết nối máy chủ. Vui lòng thử lại."]);
  }

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "message" in result
        ? (result as { message?: unknown }).message
        : undefined;
    throw new ApiError(
      response.status,
      Array.isArray(message)
        ? message.filter((item): item is string => typeof item === "string")
        : [typeof message === "string" ? message : "Không thể tải danh mục."],
    );
  }
  const body = result as {
    data?: unknown;
    meta?: PaginationMeta;
  } | null;
  if (!body || !Array.isArray(body.data) || !body.meta)
    throw new ApiError(502, ["Dữ liệu danh mục không hợp lệ."]);
  return { data: body.data as CatalogCourse[], ...body.meta };
}
