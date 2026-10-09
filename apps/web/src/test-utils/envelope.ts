import type { PaginationMeta } from "@/lib/api";

/** A successful `/api/v1/<domain>` response body. */
export const envelope = (
  data: unknown,
  extra: Record<string, unknown> = {},
) => ({
  success: true,
  statusCode: 200,
  message: "OK",
  data,
  ...extra,
});

/** A `/api/v1/<domain>` list response: rows in `data`, pagination in `meta`. */
export const pageEnvelope = (
  rows: unknown[],
  meta: Partial<PaginationMeta> = {},
) =>
  envelope(rows, {
    meta: {
      page: 1,
      limit: 20,
      total: rows.length,
      totalPages: rows.length ? 1 : 0,
      ...meta,
    },
  });
