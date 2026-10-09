// Only this public origin is bundled. Cookies remain unreadable to JavaScript.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");
// Mirrors the role_code values seeded by the API migrations (access foundation, order audit trail).
export type Role = "student" | "instructor" | "admin" | "finance_officer";
export type User = {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  avatarUrl: string | null;
  hasPassword: boolean;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public messages: string[],
    // Parsed error body, for structured errors such as
    // { code: "PREREQUISITE_LESSON_NOT_COMPLETED", requiredLesson }.
    public data: Record<string, unknown> = {},
    // The API's X-Correlation-Id: quote it to support to find the failing request.
    public correlationId?: string,
  ) {
    super(messages.join(" "));
  }
  get code(): string | undefined {
    return typeof this.data.code === "string" ? this.data.code : undefined;
  }
}

/** Pagination of the standard `/api/v1/<domain>` envelope. */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type Page<T> = { data: T[]; meta: PaginationMeta };

/** `{ success, statusCode, message, data, meta?, errors?, correlationId? }` */
type Envelope = {
  success: boolean;
  statusCode: number;
  message: string;
  data: unknown;
  meta?: PaginationMeta;
  errors?: string[];
  correlationId?: string;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** The payload of a response body: an envelope's `data`, else the body itself. */
export const unwrapBody = (body: unknown) =>
  isEnvelope(body) ? body.data : body;
const isEnvelope = (value: unknown): value is Envelope =>
  isRecord(value) &&
  typeof value.success === "boolean" &&
  typeof value.statusCode === "number" &&
  "data" in value;
export const SESSION_LOST = "shanity:session-lost";
const notifyLost = () => window.dispatchEvent(new Event(SESSION_LOST));

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, ["Không thể kết nối máy chủ. Vui lòng thử lại."]);
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => ({}));
  const correlationId = response.headers.get("x-correlation-id") ?? undefined;
  if (!response.ok) throw toApiError(response.status, data, correlationId);
  return data as T;
}

export function toApiError(
  status: number,
  data: unknown,
  correlationId?: string,
) {
  if (isEnvelope(data))
    return new ApiError(
      status,
      data.errors?.length ? data.errors : [data.message],
      // Structured details such as { code } travel in `data`.
      isRecord(data.data) ? data.data : {},
      correlationId ?? data.correlationId,
    );
  const body = isRecord(data) ? data : {};
  return new ApiError(
    status,
    [
      ...(Array.isArray(body.message)
        ? (body.message as string[])
        : [
            (body.message as string | undefined) ?? "Yêu cầu không thành công.",
          ]),
      ...(Array.isArray(body.errors)
        ? body.errors.filter((item: unknown) => typeof item === "string")
        : []),
    ],
    body,
    correlationId,
  );
}

// Web Locks serialize refresh/login/logout across tabs without storing tokens.
// The in-tab promise also coalesces simultaneous 401 responses.
export async function sessionLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request("shanity-session", task);
  return task();
}
let refreshFlight: Promise<void> | null = null;
async function refreshOnce() {
  if (!refreshFlight) {
    refreshFlight = sessionLock(async () => {
      // Another tab may already have refreshed while this tab waited for the lock.
      try {
        await send("/api/v1/me");
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
      await send("/auth/refresh", { method: "POST" });
    })
      .catch((error: unknown) => {
        notifyLost();
        throw error;
      })
      .finally(() => {
        refreshFlight = null;
      });
  }
  return refreshFlight;
}
async function authorized(
  path: string,
  init: RequestInit,
  authenticated: boolean,
): Promise<unknown> {
  try {
    return await send<unknown>(path, init);
  } catch (error) {
    if (!authenticated || !(error instanceof ApiError) || error.status !== 401)
      throw error;
    await refreshOnce();
    try {
      return await send<unknown>(path, init);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401)
        notifyLost();
      throw retryError;
    }
  }
}

/**
 * Calls the API and returns the payload: the `data` of a `/api/v1/<domain>`
 * envelope, or the body itself on the legacy routes.
 */
export async function api<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const body = await authorized(path, init, authenticated);
  return unwrapBody(body) as T;
}

/** A `/api/v1/<domain>` list: its rows plus the pagination the envelope carries. */
export async function apiPage<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Page<T>> {
  const body = await authorized(path, init, authenticated);
  if (!isEnvelope(body) || !Array.isArray(body.data) || !body.meta)
    throw new ApiError(502, ["Dữ liệu danh sách không hợp lệ."]);
  return { data: body.data as T[], meta: body.meta };
}
/**
 * `/api/v1` lists for screens written against the two list shapes the
 * services return, so a screen keeps its type when it moves to v1.
 */
export type NestedPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};
/** `{ <key>: rows, pagination }` */
export async function apiNestedPage<K extends string, T>(
  key: K,
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<{ [P in K]: T[] } & { pagination: NestedPagination }> {
  const { data, meta } = await apiPage<T>(path, init, authenticated);
  return {
    [key]: data,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      totalItems: meta.total,
      totalPages: meta.totalPages,
    },
  } as { [P in K]: T[] } & { pagination: NestedPagination };
}
/** `{ items, page, limit, total, totalPages }` */
export async function apiFlatPage<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<{ items: T[] } & PaginationMeta> {
  const { data, meta } = await apiPage<T>(path, init, authenticated);
  return { items: data, ...meta };
}
export function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Có lỗi xảy ra. Vui lòng thử lại.";
  if (error.status === 400) return "Vui lòng kiểm tra lại thông tin đã nhập.";
  if (error.status === 401)
    return "Email hoặc mật khẩu không đúng, hoặc tài khoản chưa thể đăng nhập.";
  if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.status === 413)
    return "Ảnh quá lớn. Vui lòng chọn ảnh tối đa 2 MB.";
  if (error.status === 415) return "Vui lòng chọn ảnh JPEG, PNG hoặc WebP.";
  if (error.status === 409)
    return "Dữ liệu đã tồn tại hoặc xung đột với thông tin hiện có.";
  if (error.status === 429)
    return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau một phút.";
  if (error.status === 0) return error.message;
  if (error.status >= 500)
    return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

// GET /api/v1/me: the only endpoint exposing the authenticated principal (no /auth/me route exists).
export async function getCurrentUser(authenticated = true): Promise<User> {
  const user = await api<User | null>("/api/v1/me", {}, authenticated);
  if (
    !user ||
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.displayName !== "string" ||
    !user.displayName.trim() ||
    typeof user.email !== "string" ||
    !user.email.trim() ||
    !Array.isArray(user.roles) ||
    !user.roles.every((role) => typeof role === "string")
  ) {
    throw new ApiError(502, ["Không thể tải thông tin hồ sơ."]);
  }
  return user;
}
