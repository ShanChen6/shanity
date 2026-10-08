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
  options: { errors?: string[]; details?: unknown; correlationId?: string } = {},
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
 * Existing list services return `{ items|data: T[], page, limit, total }`.
 * The envelope lifts that into `data: T[]` + `meta` so clients read one shape.
 */
function splitPage(
  value: unknown,
): { data: unknown[]; meta: PaginationMeta } | undefined {
  if (!isRecord(value)) return undefined;
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
  const totalPages =
    typeof value.totalPages === 'number'
      ? value.totalPages
      : limit > 0
        ? Math.ceil(total / limit)
        : 0;
  return { data: rows, meta: { page, limit, total, totalPages } };
}
