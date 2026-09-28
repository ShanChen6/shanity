// Only this public origin is bundled. Cookies remain unreadable to JavaScript.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");
export type User = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public messages: string[],
  ) {
    super(messages.join(" "));
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
        ...(init.body ? { "Content-Type": "application/json" } : {}),
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
      Array.isArray(data.message)
        ? data.message
        : [data.message ?? "Yêu cầu không thành công."],
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
  if (error.status === 401)
    return "Email hoặc mật khẩu không đúng, hoặc tài khoản chưa thể đăng nhập.";
  if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.status === 429)
    return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau một phút.";
  if (error.status === 0) return error.message;
  return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}
