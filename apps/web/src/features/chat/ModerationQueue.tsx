"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Failure } from "@/features/instructor/shared";
import { errorMessage } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";
import {
  chatKeys,
  dismissChatReports,
  fetchModerationQueue,
  type ChatQueueItem,
} from "./api";
import { avatarSrc, messageDateTime, shortDateTime } from "./chat-format";
import { HideMessageDialog, MuteUserDialog } from "./ModerationDialogs";

/** The queue refreshes itself this often while open. */
export const QUEUE_REFRESH_MS = 30_000;

type OpenDialog =
  | { kind: "hide"; item: ChatQueueItem }
  | { kind: "mute"; item: ChatQueueItem }
  | null;

/**
 * Reported chat messages across the courses the instructor teaches (every
 * course for admins), most recently reported first, with the three
 * decisions: hide, dismiss the reports, or mute the sender.
 */
export function ModerationQueue() {
  const client = useQueryClient();
  const toasts = useToast();
  const [courseId, setCourseId] = useState("all");
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const query = useQuery({
    queryKey: chatKeys.queue,
    queryFn: ({ signal }) => fetchModerationQueue(signal),
    refetchInterval: QUEUE_REFRESH_MS,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: chatKeys.queue });
  const dismiss = useMutation({
    mutationFn: (messageId: string) => dismissChatReports(messageId),
    onSuccess: () => {
      toasts.success("Đã bỏ qua báo cáo. Tin nhắn được giữ nguyên.");
      void refresh();
    },
    onError: (error) => toasts.error(errorMessage(error)),
  });

  const courses = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of query.data ?? []) byId.set(item.course.id, item.course.title);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [query.data]);
  const items = (query.data ?? []).filter(
    (item) => courseId === "all" || item.course.id === courseId,
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kiểm duyệt thảo luận</h1>
          <p className="text-sm text-muted">
            Tin nhắn bị học viên báo cáo trong các khóa học bạn phụ trách.
          </p>
        </div>
        {courses.length > 1 && (
          <div className="w-full sm:w-64">
            <Label htmlFor="queue-course">Khóa học</Label>
            <Select
              id="queue-course"
              className="mt-1"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="all">Tất cả khóa học</option>
              {courses.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </Select>
          </div>
        )}
      </header>

      {query.isPending ? (
        <QueueSkeleton />
      ) : query.error ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center"
          data-testid="moderation-empty"
        >
          <ShieldCheck className="size-10 text-success" aria-hidden="true" />
          <p className="font-semibold">Không có báo cáo nào cần xử lý</p>
          <p className="text-sm text-muted">
            Báo cáo mới sẽ tự hiện ở đây.
          </p>
        </div>
      ) : (
        <ul className="space-y-4" aria-label="Tin nhắn bị báo cáo">
          {items.map((item) => (
            <QueueCard
              key={item.message.id}
              item={item}
              dismissing={
                dismiss.isPending && dismiss.variables === item.message.id
              }
              onHide={() => setDialog({ kind: "hide", item })}
              onMute={() => setDialog({ kind: "mute", item })}
              onDismiss={() => dismiss.mutate(item.message.id)}
            />
          ))}
        </ul>
      )}

      {dialog?.kind === "hide" && (
        <HideMessageDialog
          message={dialog.item.message}
          onClose={() => setDialog(null)}
          onHidden={() => void refresh()}
        />
      )}
      {dialog?.kind === "mute" && (
        <MuteUserDialog
          courseId={dialog.item.course.id}
          user={dialog.item.message.sender}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function QueueCard({
  item,
  dismissing,
  onHide,
  onMute,
  onDismiss,
}: {
  item: ChatQueueItem;
  dismissing: boolean;
  onHide: () => void;
  onMute: () => void;
  onDismiss: () => void;
}) {
  const { message, course, reports } = item;
  return (
    <li
      className="overflow-hidden rounded-lg border border-border bg-surface"
      data-testid="moderation-item"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-secondary px-4 py-2 text-sm">
        <Link
          href={`/learn/${encodeURIComponent(course.slug)}/chat`}
          className="min-w-0 flex-1 truncate font-semibold hover:underline"
        >
          {course.title}
        </Link>
        <Badge tone="warning">{item.reportCount} báo cáo</Badge>
        <span className="text-xs text-muted">
          Báo cáo gần nhất {shortDateTime(item.lastReportedAt)}
        </span>
      </div>
      <div className="flex gap-3 px-4 py-3">
        <Avatar
          name={message.sender.name}
          src={avatarSrc(message.sender.avatarUrl)}
          unoptimized
          className="size-9"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{message.sender.name}</span>{" "}
            <time
              dateTime={message.createdAt}
              title={messageDateTime(message.createdAt)}
              className="text-xs text-muted"
            >
              {shortDateTime(message.createdAt)}
            </time>
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-surface-secondary px-3 py-2 text-sm">
            {message.content}
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">
              Xem {reports.length} lý do báo cáo
            </summary>
            <ul className="mt-2 space-y-1.5">
              {reports.map((report) => (
                <li key={report.id} className="border-l-2 border-border pl-3">
                  <p className="break-words">{report.reason}</p>
                  <p className="text-xs text-muted">
                    {report.reporter.name} · {shortDateTime(report.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
        <Button size="sm" variant="ghost" onClick={onMute}>
          Tạm khóa người gửi
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={dismissing}
          loadingLabel="Đang bỏ qua…"
          onClick={onDismiss}
        >
          Bỏ qua báo cáo
        </Button>
        <Button size="sm" variant="danger" onClick={onHide}>
          Ẩn tin nhắn
        </Button>
      </div>
    </li>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Đang tải">
      {[0, 1].map((row) => (
        <div key={row} className="space-y-3 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-14 flex-1" />
          </div>
        </div>
      ))}
    </div>
  );
}
