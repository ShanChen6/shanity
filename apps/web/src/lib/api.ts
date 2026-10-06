// Only this public origin is bundled. Cookies remain unreadable to JavaScript.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");
// Mirrors role_code values seeded in apps/api/database/migrations/202609270003_access_foundation.mjs.
export type Role = "student" | "instructor" | "admin";
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
  ) {
    super(messages.join(" "));
  }
  get code(): string | undefined {
    return typeof this.data.code === "string" ? this.data.code : undefined;
  }
}
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      [
        ...(Array.isArray(data.message)
          ? data.message
          : [data.message ?? "Yêu cầu không thành công."]),
        ...(Array.isArray(data.errors)
          ? data.errors.filter((item: unknown) => typeof item === "string")
          : []),
      ],
      data && typeof data === "object" ? data : {},
    );
  return data as T;
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
        await send("/users/me");
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
export async function api<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    if (!authenticated || !(error instanceof ApiError) || error.status !== 401)
      throw error;
    await refreshOnce();
    try {
      return await send<T>(path, init);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401)
        notifyLost();
      throw retryError;
    }
  }
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

// GET /users/me: the only endpoint exposing the authenticated principal (no /auth/me route exists).
export async function getCurrentUser(authenticated = true): Promise<User> {
  const user = await api<User | null>("/users/me", {}, authenticated);
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
