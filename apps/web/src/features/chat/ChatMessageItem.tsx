"use client";

import { memo } from "react";
import { EyeOff, Flag, MoreHorizontal, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { avatarSrc, messageDateTime, messageTime } from "./chat-format";
import type { ChatMessage } from "./types";

export type MessageAction = "report" | "hide" | "mute";

/** Which actions the viewer gets on a message. */
export function messageActions(
  message: ChatMessage,
  viewer: { id: string; isModerator: boolean },
): MessageAction[] {
  const own = message.sender.id === viewer.id;
  if (message.status === "HIDDEN") return [];
  if (viewer.isModerator)
    return own ? ["hide"] : ["hide", "mute"];
  return own ? [] : ["report"];
}

const LABELS: Record<MessageAction, { text: string; icon: typeof Flag }> = {
  report: { text: "Báo cáo tin nhắn", icon: Flag },
  hide: { text: "Ẩn tin nhắn", icon: EyeOff },
  mute: { text: "Tạm khóa người gửi", icon: VolumeX },
};

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  showHeader,
  own,
  showStatus,
  actions,
  onAction,
}: {
  message: ChatMessage;
  showHeader: boolean;
  own: boolean;
  /** Moderators only: whether a message is reported or hidden. */
  showStatus: boolean;
  actions: MessageAction[];
  onAction: (action: MessageAction, message: ChatMessage) => void;
}) {
  const hidden = message.status === "HIDDEN";
  // Learners get only a placeholder (the content was dropped on the event);
  // moderators keep the text, marked as hidden.
  const placeholder = hidden && !message.content;
  const items: DropdownItem[] = actions.map((action) => {
    const { text, icon: ActionIcon } = LABELS[action];
    return {
      key: action,
      label: (
        <span className="inline-flex items-center gap-2">
          <ActionIcon className="size-4" aria-hidden="true" />
          {text}
        </span>
      ),
      onSelect: () => onAction(action, message),
    };
  });
  return (
    <li
      data-testid="chat-message"
      data-message-id={message.id}
      className={cn(
        "group relative flex gap-3 rounded-md px-4 hover:bg-surface-hover",
        showHeader ? "mt-3 pt-1" : "mt-0.5",
        own && "bg-surface-secondary/40",
      )}
    >
      <div className="w-9 shrink-0">
        {showHeader ? (
          <Avatar
            name={message.sender.name}
            src={avatarSrc(message.sender.avatarUrl)}
            unoptimized
            className="size-9"
          />
        ) : (
          <time
            dateTime={message.createdAt}
            className="invisible block pt-0.5 text-right text-[0.65rem] text-muted group-hover:visible"
          >
            {messageTime(message.createdAt)}
          </time>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        {showHeader && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold">
              {message.sender.name}
              {own && <span className="font-normal text-muted"> (bạn)</span>}
            </span>
            <time
              dateTime={message.createdAt}
              title={messageDateTime(message.createdAt)}
              className="text-xs text-muted"
            >
              {messageTime(message.createdAt)}
            </time>
          </p>
        )}
        {placeholder ? (
          <p className="text-sm italic text-muted">
            Tin nhắn này đã bị ẩn bởi người kiểm duyệt.
          </p>
        ) : (
          // Plain text only: never rendered as HTML.
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-sm leading-relaxed",
              hidden && "text-muted line-through decoration-muted/50",
            )}
          >
            {message.content}
          </p>
        )}
        {showStatus &&
          (hidden || message.status === "FLAGGED") &&
          !placeholder && (
          <Badge tone={hidden ? "neutral" : "warning"} className="mt-1">
            {hidden ? "Đã ẩn với học viên" : "Đang bị báo cáo"}
          </Badge>
        )}
      </div>
      {items.length > 0 && (
        <div className="absolute right-2 top-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <DropdownMenu
            label={<MoreHorizontal className="size-4" aria-hidden="true" />}
            ariaLabel={`Thao tác với tin nhắn của ${message.sender.name}`}
            items={items}
            variant="ghost"
            align="end"
          />
        </div>
      )}
    </li>
  );
});
