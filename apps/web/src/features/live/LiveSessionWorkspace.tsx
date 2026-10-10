"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CircleStop, Radio, Video } from "lucide-react";
import { BreadcrumbLabel } from "@/components/layout/breadcrumbs";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/session-provider";
import { avatarSrc } from "@/features/chat/chat-format";
import { CourseChatRoom } from "@/features/chat/CourseChatRoom";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fetchCourseLiveSessions, liveKeys, liveSessionHref } from "./api";
import { AttendanceIndicator } from "./AttendanceIndicator";
import { AttendanceReport } from "./AttendanceReport";
import { LivePlayer } from "./LivePlayer";
import { useLiveClassHeartbeat } from "./useLiveClassHeartbeat";
import { formatCountdown, phaseAt } from "./live-time";
import type { LiveSession, LiveStatus } from "./types";
import { useLiveSession } from "./use-live-session";

const when = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dayMonth = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const clock = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
/** "10/10 · 04:23" */
const short = (iso: string) => `${dayMonth.format(new Date(iso))} · ${clock.format(new Date(iso))}`;

const STATUS: Record<LiveStatus, { label: string; tone: "info" | "danger" | "neutral" | "warning" }> = {
  SCHEDULED: { label: "Sắp diễn ra", tone: "info" },
  LIVE: { label: "Đang phát trực tiếp", tone: "danger" },
  ENDED: { label: "Đã kết thúc", tone: "neutral" },
  CANCELLED: { label: "Đã hủy", tone: "warning" },
};

/**
 * The learner's live class: a waiting room with a countdown before the
 * start, the embedded stream while it is on, a closing screen (with the
 * replay where there is one) afterwards, the course's other sessions on
 * the left and the course chat on the right.
 */
export function LiveSessionWorkspace({
  courseSlug,
  sessionId,
}: {
  courseSlug: string;
  sessionId: string;
}) {
  const router = useRouter();
  const { user } = useSession();
  const live = useLiveSession(sessionId);
  const { session } = live;

  // A link with another course's slug: send the reader to the right one.
  useEffect(() => {
    if (session && session.course.slug !== courseSlug)
      router.replace(liveSessionHref(session.course.slug, session.id));
  }, [session, courseSlug, router]);

  if (live.isPending) return <WorkspaceSkeleton />;
  if (live.error || !session) return <Refused error={live.error} courseSlug={courseSlug} />;

  const phase = live.phase ?? session.status;
  const status = STATUS[phase];
  return (
    <div className="container py-6">
      <BreadcrumbLabel href={`/student/courses/${encodeURIComponent(courseSlug)}`} label={session.course.title} />
      <BreadcrumbLabel href={liveSessionHref(courseSlug, session.id)} label={session.title} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[16rem_minmax(0,1fr)_24rem]">
        <SessionList courseId={session.courseId} courseSlug={courseSlug} activeId={session.id} serverNow={live.serverNow} />

        <main className="min-w-0 space-y-5">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone} data-testid="live-status">
                {phase === "LIVE" && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-current" aria-hidden="true" />}
                {status.label}
              </Badge>
              <span className="text-sm text-muted">{session.course.title}</span>
            </div>
            <h1 className="font-heading text-h2 font-bold leading-tight">{session.title}</h1>
          </header>

          {phase === "SCHEDULED" && (
            <PreStream session={session} serverNow={live.serverNow} />
          )}
          {phase === "LIVE" &&
            (session.embedUrl ? (
              <LivePlayer url={session.embedUrl} provider={session.provider} title={session.title} />
            ) : (
              <Opening />
            ))}
          {phase === "ENDED" && <PostStream session={session} courseSlug={courseSlug} />}
          {phase === "CANCELLED" && (
            <Alert tone="warning" title="Buổi học đã bị hủy">
              Giảng viên đã hủy buổi học này. Hãy theo dõi lịch các buổi tiếp theo.
            </Alert>
          )}

          <SessionInfo session={session} />
          {session.canManage && (
            <AttendanceReport courseId={session.courseId} sessionId={session.id} />
          )}
        </main>

        {!session.canManage && (phase === "LIVE" || phase === "ENDED") && (
          <StudentAttendance
            sessionId={session.id}
            // Counting starts only once the player is actually on screen.
            live={phase === "LIVE" && !!session.embedUrl}
          />
        )}

        <aside className="h-[70vh] min-h-[28rem] overflow-hidden rounded-lg border border-border lg:sticky lg:top-24" aria-label="Thảo luận khóa học">
          {user && (
            <CourseChatRoom userId={user.id} courseId={session.courseId} courseTitle={session.course.title} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** Sends the heartbeats and shows what the server has credited. */
function StudentAttendance({ sessionId, live }: { sessionId: string; live: boolean }) {
  const { attendance, paused } = useLiveClassHeartbeat(sessionId, live);
  return attendance ? <AttendanceIndicator attendance={attendance} paused={paused} /> : null;
}

function PreStream({ session, serverNow }: { session: LiveSession; serverNow: number }) {
  const left = Date.parse(session.startTime) - serverNow;
  return (
    <section
      aria-label="Phòng chờ"
      className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-ink to-brand-teal p-8 text-white sm:p-12"
      data-testid="live-waiting-room"
    >
      <CalendarClock className="size-10 text-brand-mint" aria-hidden="true" />
      <p className="mt-4 text-sm uppercase tracking-wide text-white/80">Buổi học bắt đầu sau</p>
      {/* Read once by screen readers, not every second. */}
      <p role="timer" aria-live="off" className="mt-2 font-mono text-5xl font-bold tabular-nums sm:text-6xl" data-testid="live-countdown">
        {formatCountdown(left)}
      </p>
      <p className="mt-4 text-white/90">
        {when.format(new Date(session.startTime))} · trình phát sẽ tự mở khi đến giờ, không cần tải lại trang.
      </p>
      {session.canManage && session.embedUrl && (
        <details className="mt-6 rounded-md bg-black/20 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Xem trước trình phát (chỉ giảng viên)</summary>
          <div className="mt-3">
            <LivePlayer url={session.embedUrl} provider={session.provider} title={session.title} />
          </div>
        </details>
      )}
    </section>
  );
}

function Opening() {
  return (
    <div className="flex aspect-video items-center justify-center rounded-lg bg-black text-white" role="status" data-testid="live-opening">
      <Radio className="mr-2 size-5 animate-pulse" aria-hidden="true" />
      Đang mở phòng học…
    </div>
  );
}

function PostStream({ session, courseSlug }: { session: LiveSession; courseSlug: string }) {
  return (
    <section aria-label="Buổi học đã kết thúc" className="space-y-4" data-testid="live-ended">
      <Alert tone="info" title="Buổi học đã kết thúc">
        {session.isReplay && session.embedUrl
          ? "Bạn có thể xem lại bản ghi bên dưới."
          : "Buổi học này không có bản ghi để xem lại."}{" "}
        Hãy ôn lại bằng bài học và bài tập của khóa.
      </Alert>
      {session.isReplay && session.embedUrl && (
        <LivePlayer url={session.embedUrl} provider={session.provider} title={`Xem lại: ${session.title}`} />
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/learn/${encodeURIComponent(courseSlug)}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <Video className="size-4" aria-hidden="true" />
          Ôn tập trong khóa học
        </Link>
      </div>
    </section>
  );
}

function SessionInfo({ session }: { session: LiveSession }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-label="Thông tin buổi học">
      <div className="flex items-center gap-3">
        <Avatar name={session.instructor.name} src={avatarSrc(session.instructor.avatarUrl)} unoptimized className="size-11" />
        <div>
          <p className="font-semibold">{session.instructor.name}</p>
          <p className="text-sm text-muted">
            {when.format(new Date(session.startTime))} – {clock.format(new Date(session.endTime))}
          </p>
        </div>
      </div>
      {session.description && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Nội dung & tài liệu chuẩn bị</h2>
          {/* Plain text, line breaks kept. */}
          <p className="mt-2 whitespace-pre-wrap break-words">{session.description}</p>
        </div>
      )}
    </section>
  );
}

function SessionList({
  courseId,
  courseSlug,
  activeId,
  serverNow,
}: {
  courseId: string;
  courseSlug: string;
  activeId: string;
  serverNow: number;
}) {
  const list = useQuery({
    queryKey: liveKeys.course(courseId),
    queryFn: ({ signal }) => fetchCourseLiveSessions(courseId, signal),
    refetchInterval: 60_000,
  });
  return (
    <nav aria-label="Các buổi học trực tiếp" className="hidden xl:block">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Lịch học trực tiếp</h2>
      <ol className="space-y-1.5">
        {(list.data?.sessions ?? []).map((item) => {
          const phase = phaseAt(item, serverNow);
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <Link
                href={liveSessionHref(courseSlug, item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md border px-3 py-2 text-sm",
                  active ? "border-primary bg-secondary" : "border-transparent hover:bg-surface-hover",
                  phase === "ENDED" || phase === "CANCELLED" ? "text-muted" : "",
                )}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  {phase === "LIVE" && <Radio className="size-3.5 text-danger-foreground" aria-label="Đang phát" />}
                  {phase === "CANCELLED" && <CircleStop className="size-3.5" aria-label="Đã hủy" />}
                  <span className="line-clamp-2">{item.title}</span>
                </span>
                <span className="text-xs text-muted">{short(item.startTime)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Refused({ error, courseSlug }: { error: unknown; courseSlug: string }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <div className="container py-10" data-testid="live-refused">
      <Alert
        tone={forbidden || missing ? "warning" : "error"}
        title={
          forbidden
            ? "Bạn không có quyền vào buổi học này"
            : missing
              ? "Không tìm thấy buổi học"
              : "Chưa tải được buổi học"
        }
      >
        {forbidden ? (
          <>
            Buổi học trực tiếp chỉ dành cho học viên đã ghi danh khóa học.{" "}
            <Link href={`/courses/${encodeURIComponent(courseSlug)}`} className="font-semibold underline">
              Xem khóa học
            </Link>
          </>
        ) : (
          errorMessage(error)
        )}
      </Alert>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="container space-y-4 py-6" role="status" aria-busy="true" aria-label="Đang tải buổi học">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="aspect-video w-full max-w-4xl" />
    </div>
  );
}
