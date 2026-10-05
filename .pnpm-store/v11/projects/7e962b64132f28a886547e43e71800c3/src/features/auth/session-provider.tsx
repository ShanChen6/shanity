"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  api,
  errorMessage,
  getCurrentUser,
  SESSION_LOST,
  sessionLock,
} from "@/lib/api";
import type { LoginRequest, RegisterRequest, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous" | "error";
type Session = {
  user: User | null;
  status: Status;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string;
  message: string;
  load: () => Promise<User | null>;
  signIn: (
    path: "/auth/login" | "/auth/register",
    data: SignInPayload,
  ) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  update: (name: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
};
type SignInPayload = LoginRequest | RegisterRequest;
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const flight = useRef<Promise<User | null> | null>(null);
  const reset = useCallback(() => {
    generation.current++;
    setUser(null);
    setStatus("anonymous");
    setError("");
    setMessage("");
  }, []);
  const load = useCallback(() => {
    if (flight.current) return flight.current;
    const current = generation.current;
    flight.current = getCurrentUser()
      .then((profile) => {
        if (current !== generation.current) return null;
        setUser(profile);
        setStatus("authenticated");
        setError("");
        return profile;
      })
      .catch((reason: unknown) => {
        if (current === generation.current) {
          setUser(null);
          if (reason instanceof ApiError && reason.status === 401)
            setStatus("anonymous");
          else {
            setStatus("error");
            setError(errorMessage(reason));
          }
        }
        return null;
      })
      .finally(() => {
        flight.current = null;
      });
    return flight.current;
  }, []);
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("shanity-session-events")
        : null;
    channelRef.current = channel;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "logout") reset();
        else if (event.data === "changed") {
          generation.current++;
          setUser(null);
          setStatus("loading");
          void (flight.current ?? Promise.resolve()).then(() => load());
        }
      };
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(SESSION_LOST, reset);
    window.addEventListener("focus", onFocus);
    void load();
    return () => {
      channel?.close();
      if (channelRef.current === channel) channelRef.current = null;
      window.removeEventListener(SESSION_LOST, reset);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, reset]);
  function broadcast(value: string) {
    // Reuse the receiving channel: BroadcastChannel excludes the sender object.
    // Creating a second channel here would notify this tab and reset its own form.
    channelRef.current?.postMessage(value);
  }
  async function signIn(
    path: "/auth/login" | "/auth/register",
    data: SignInPayload,
  ) {
    // Wait for bootstrap/refresh before replacing its cookie session.
    await flight.current;
    const profile = await sessionLock(async () => {
      await api(path, { method: "POST", body: JSON.stringify(data) }, false);
      generation.current++;
      const profile = await getCurrentUser(false);
      setUser(profile);
      setStatus("authenticated");
      setError("");
      setMessage(
        path === "/auth/register"
          ? "Đăng ký thành công. Chào mừng bạn đến với Shanity!"
          : "Đăng nhập thành công.",
      );
      return profile;
    });
    broadcast("changed");
    return profile;
  }
  async function logout() {
    await sessionLock(() => api("/auth/logout", { method: "POST" }, false));
    reset();
    broadcast("logout");
  }
  async function changePassword(currentPassword: string, newPassword: string) {
    await flight.current;
    // Refresh before taking the lock: api's automatic refresh uses this same lock.
    await getCurrentUser();
    await sessionLock(async () => {
      await api(
        "/users/me/password",
        {
          method: "PATCH",
          body: JSON.stringify({ currentPassword, newPassword }),
        },
        false,
      );
      reset();
      setMessage("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
      broadcast("logout");
    });
  }
  async function updateSelf(path: string, init: RequestInit, notice: string) {
    const current = generation.current;
    const profile = await api<User>(path, init);
    if (current === generation.current) {
      // Ignore older focus/bootstrap reads that finish after this write.
      generation.current++;
      setUser(profile);
      setStatus("authenticated");
      setError("");
      setMessage(notice);
    } else {
      // Another tab may have changed the session while this write committed.
      // Re-read the current identity instead of applying an obsolete response.
      await flight.current;
      await load();
    }
    broadcast("changed");
  }
  function update(displayName: string) {
    return updateSelf(
      "/users/me",
      { method: "PATCH", body: JSON.stringify({ displayName }) },
      "Đã cập nhật hồ sơ.",
    );
  }
  function uploadAvatar(file: File) {
    const body = new FormData();
    body.append("file", file);
    return updateSelf(
      "/users/me/avatar",
      { method: "POST", body },
      "Đã cập nhật ảnh đại diện.",
    );
  }
  function removeAvatar() {
    return updateSelf(
      "/users/me/avatar",
      { method: "DELETE" },
      "Đã xóa ảnh đại diện.",
    );
  }
  return (
    <Context.Provider
      value={{
        user,
        status,
        isAuthenticated: status === "authenticated",
        isLoading: status === "loading",
        error,
        message,
        load,
        signIn,
        logout,
        changePassword,
        update,
        uploadAvatar,
        removeAvatar,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
