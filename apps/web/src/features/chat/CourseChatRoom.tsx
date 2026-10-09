"use client";

import { useCallback, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { ApiError, errorMessage } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import type { MessageAction } from "./ChatMessageItem";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import {
  HideMessageDialog,
  MuteUserDialog,
  ReportMessageDialog,
} from "./ModerationDialogs";
import type { ChatPageFetcher } from "./api";
import type { ChatMessage } from "./types";
import { useChatRoom } from "./use-chat-room";

type OpenDialog = { action: MessageAction; message: ChatMessage } | null;

/** Why a send was refused, in the learner's words. */
export function sendErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "CHAT_RATE_LIMITED")
      return "Bạn gửi tin quá nhanh. Vui lòng chờ vài giây rồi thử lại.";
    if (error.code === "CHAT_MUTED")
      return "Bạn đang bị tạm khóa gửi tin trong phòng này.";
    if (error.status === 403)
      return "Bạn không còn quyền gửi tin trong phòng này.";
  }
  return errorMessage(error);
}

/**
 * A course's group chat: live timeline, composer, and the report or
 * moderation actions the viewer's role allows.
 */
export function CourseChatRoom({
  userId,
  courseId,
  courseTitle,
  fetcher,
}: {
  userId: string;
  courseId: string;
  courseTitle: string;
  fetcher?: ChatPageFetcher;
}) {
  const room = useChatRoom(userId, courseId, { fetcher });
  const online = useOnlineStatus();
  const toasts = useToast();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = useCallback(() => setDialog(null), []);
  const onAction = useCallback(
    (action: MessageAction, message: ChatMessage) =>
      setDialog({ action, message }),
    [],
  );
  const { loadOlder } = room;
  const onLoadOlder = useCallback(() => void loadOlder(), [loadOlder]);

  async function send(content: string) {
    try {
      await room.send.mutateAsync(content);
      return true;
    } catch (error) {
      toasts.error(sendErrorMessage(error), { id: "chat-send" });
      return false;
    }
  }

  return (
    <section
      aria-label={`Thảo luận: ${courseTitle}`}
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="course-chat-room"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <MessagesSquare className="size-5 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">Thảo luận khóa học</h2>
          <p className="truncate text-xs text-muted">
            {room.isModerator
              ? "Bạn là giảng viên: có thể ẩn tin nhắn và tạm khóa học viên."
              : "Trao đổi cùng giảng viên và các bạn trong khóa."}
          </p>
        </div>
        <ConnectionStatusBadge status={room.status} />
      </header>

      {room.refused ? (
        <div className="p-6">
          <Alert tone="warning" title="Bạn không có quyền vào phòng thảo luận này">
            Phòng thảo luận chỉ dành cho học viên đang ghi danh và giảng viên của
            khóa học.
          </Alert>
        </div>
      ) : room.messages.length === 0 && room.isSyncing ? (
        <ChatSkeleton />
      ) : room.messages.length === 0 && room.error ? (
        <div className="p-6">
          <Alert tone="error" title="Chưa tải được tin nhắn">
            <p>{errorMessage(room.error)}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={room.sync}>
              Thử lại
            </Button>
          </Alert>
        </div>
      ) : room.messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MessagesSquare className="size-10 text-muted" aria-hidden="true" />
          <p className="font-semibold">Chưa có tin nhắn nào</p>
          <p className="text-sm text-muted">Hãy là người mở đầu cuộc thảo luận.</p>
        </div>
      ) : (
        <ChatMessageList
          messages={room.messages}
          viewer={{ id: userId, isModerator: room.isModerator }}
          hasOlder={room.hasOlder}
          loadingOlder={room.loadingOlder}
          onLoadOlder={onLoadOlder}
          onAction={onAction}
        />
      )}

      {!room.refused && (
        <ChatComposer
          onSend={send}
          sending={room.send.isPending}
          mutedUntil={room.mutedUntil}
          offline={!online}
        />
      )}

      {dialog?.action === "report" && (
        <ReportMessageDialog message={dialog.message} onClose={close} />
      )}
      {dialog?.action === "hide" && (
        <HideMessageDialog
          message={dialog.message}
          onClose={close}
          // Applied at once; the real-time event (if any) is a no-op after.
          onHidden={() =>
            room.hide(dialog.message.id, { keepContent: true })
          }
        />
      )}
      {dialog?.action === "mute" && (
        <MuteUserDialog
          courseId={courseId}
          user={dialog.message.sender}
          onClose={close}
        />
      )}
    </section>
  );
}

function ChatSkeleton() {
  return (
    <div
      className="flex-1 space-y-5 p-4"
      role="status"
      aria-busy="true"
      aria-label="Đang tải tin nhắn"
    >
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
