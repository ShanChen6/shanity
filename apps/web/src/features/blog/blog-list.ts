import { ApiError } from "@/lib/api";
import type { BlogList } from "./types";

/**
 * A /api/v1 list arrives as `{ data: rows, meta: pagination }` (the
 * envelope lifts `{ items, page, ... }` into that shape).
 */
export function toBlogList(body: unknown): BlogList {
  const envelope = body as {
    data?: unknown;
    meta?: Omit<BlogList, "items">;
  } | null;
  if (!envelope || !Array.isArray(envelope.data) || !envelope.meta)
    throw new ApiError(502, ["Dữ liệu bài viết không hợp lệ."]);
  return { items: envelope.data as BlogList["items"], ...envelope.meta };
}
