/** The one response shape of every `/api/v1/<domain>/*` route. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  /** Present on failures only; human readable, safe to show. */
  errors?: string[];
  correlationId?: string;
}

const DEFAULT_MESSAGES: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  202: 'Accepted',
};

export function successEnvelope<T>(
  statusCode: number,
  value: T,
  correlationId?: string,
): ApiResponse<unknown> {
  const paged = splitPage(value);
  return {
    success: true,
    statusCode,
    message: DEFAULT_MESSAGES[statusCode] ?? 'Success',
    data: paged ? paged.data : (value ?? null),
    ...(paged ? { meta: paged.meta } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

export function errorEnvelope(
  statusCode: number,
  message: string,
  options: {
    errors?: string[];
    details?: unknown;
    correlationId?: string;
  } = {},
): ApiResponse<unknown> {
  return {
    success: false,
    statusCode,
    message,
    data: options.details ?? null,
    ...(options.errors?.length ? { errors: options.errors } : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Existing list services return one of two shapes; the envelope lifts both
 * into `data: T[]` + `meta` so clients read a single shape:
 *
 *  - `{ items | data: T[], page, limit, total, totalPages? }`
 *  - `{ <list>: T[], pagination: { page, limit, totalItems | total, totalPages? } }`
 *    (the list is the only other key, so nothing is dropped)
 */
function splitPage(
  value: unknown,
): { data: unknown[]; meta: PaginationMeta } | undefined {
  if (!isRecord(value)) return undefined;
  const flat = splitFlatPage(value);
  return flat ?? splitNestedPage(value);
}

const withTotalPages = (
  page: number,
  limit: number,
  total: number,
  totalPages: unknown,
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages:
    typeof totalPages === 'number'
      ? totalPages
      : limit > 0
        ? Math.ceil(total / limit)
        : 0,
});

function splitFlatPage(value: Record<string, unknown>) {
  const rows = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.data)
      ? value.data
      : undefined;
  const { page, limit, total } = value;
  if (
    !rows ||
    typeof page !== 'number' ||
    typeof limit !== 'number' ||
    typeof total !== 'number'
  )
    return undefined;
  return {
    data: rows,
    meta: withTotalPages(page, limit, total, value.totalPages),
  };
}

function splitNestedPage(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  const { pagination } = value;
  if (keys.length !== 2 || !isRecord(pagination)) return undefined;
  const listKey = keys.find((key) => key !== 'pagination');
  const rows = listKey ? value[listKey] : undefined;
  const total = pagination.totalItems ?? pagination.total;
  if (
    !Array.isArray(rows) ||
    typeof pagination.page !== 'number' ||
    typeof pagination.limit !== 'number' ||
    typeof total !== 'number'
  )
    return undefined;
  return {
    data: rows,
    meta: withTotalPages(
      pagination.page,
      pagination.limit,
      total,
      pagination.totalPages,
    ),
  };
}
