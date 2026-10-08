"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedSession } from "@/features/auth/protected-session";
import { useSession } from "@/features/auth/session-provider";
import { CurrentUserAvatar } from "@/features/auth/current-user-avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ApiError } from "@/lib/api";
import "./portal.css";
export function InstructorPortal({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <ProtectedSession requiredRole="instructor">
      <PortalSession key={user?.id}>{children}</PortalSession>
    </ProtectedSession>
  );
}
function PortalSession({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const [error, setError] = useState("");
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15000,
            retry: (count, error) =>
              !(
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
              ) && count < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <div className="instructor-portal">
        <aside className="instructor-sidebar">
          <Link href="/instructor/courses" className="instructor-brand">
            shanity<span>INSTRUCTOR STUDIO</span>
          </Link>
          <nav aria-label="Instructor navigation">
            <Link href="/instructor/courses">← My Courses</Link>
            <Link href="/instructor/courses/new">＋ New Course</Link>
            <Link href="/instructor/quizzes">✎ Quizzes</Link>
            <Link href="/instructor/grading">✓ Chấm bài</Link>
            <Link href="/courses">Khám phá khóa học ↗</Link>
          </nav>
          <p className="instructor-sidebar-note">
            Chia sẻ kiến thức.
            <br />
            Tạo nên những hành trình học tập.
          </p>
        </aside>
        <div className="instructor-workspace">
          <header className="instructor-header">
            <span>Không gian giảng viên</span>
            <div className="instructor-actions">
              <ThemeToggle />
              <Link href="/profile" className="instructor-profile">
                <CurrentUserAvatar className="size-9" />
                <span>{user?.displayName}</span>
              </Link>
              <button
                onClick={() => {
                  void logout().catch(() =>
                    setError("Không thể đăng xuất. Vui lòng thử lại."),
                  );
                }}
              >
                Đăng xuất
              </button>
            </div>
          </header>
          <main className="instructor-main">
            {error && <p role="alert">{error}</p>}
            {children}
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
