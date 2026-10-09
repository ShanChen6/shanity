"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { layoutMessages } from "./chat-format";
import {
  ChatMessageItem,
  messageActions,
  type MessageAction,
} from "./ChatMessageItem";
import type { ChatMessage } from "./types";

/** Within this many pixels of the bottom counts as "at the bottom". */
export const STICK_TO_BOTTOM_PX = 80;

type Snapshot = {
  firstId?: string;
  lastId?: string;
  scrollHeight: number;
  scrollTop: number;
};

/**
 * The room's scrolling timeline:
 *
 * - opens at the newest message;
 * - follows new messages while the reader is at the bottom (and always for
 *   their own), otherwise counts them on a "new messages" button;
 * - loads older pages when the top comes into view, keeping the reader's
 *   place as they are inserted above.
 */
export function ChatMessageList({
  messages,
  viewer,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onAction,
}: {
  messages: ChatMessage[];
  viewer: { id: string; isModerator: boolean };
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onAction: (action: MessageAction, message: ChatMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const snapshot = useRef<Snapshot>({ scrollHeight: 0, scrollTop: 0 });
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const rows = useMemo(() => layoutMessages(messages), [messages]);

  const scrollToBottom = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  }, []);

  // Before paint, so the reader never sees the list jump.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const before = snapshot.current;
    const first = messages[0];
    const last = messages.at(-1);

    if (!before.lastId && last) {
      scrollToBottom(); // first render with messages
    } else if (first && first.id !== before.firstId && last?.id === before.lastId) {
      // Older page inserted above: keep the same message under the eye.
      element.scrollTop =
        element.scrollHeight - before.scrollHeight + before.scrollTop;
    } else if (last && last.id !== before.lastId) {
      if (atBottom.current || last.sender.id === viewer.id) scrollToBottom();
      else {
        const known = messages.findIndex((m) => m.id === before.lastId);
        setUnseen((count) =>
          count + (known === -1 ? 1 : messages.length - 1 - known),
        );
      }
    }
    snapshot.current = {
      firstId: first?.id,
      lastId: last?.id,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  }, [messages, viewer.id, scrollToBottom]);

  // Reaching the top asks for the previous page.
  useEffect(() => {
    const sentinel = top.current;
    const root = scroller.current;
    if (!sentinel || !root || !hasOlder || loadingOlder) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadOlder();
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlder, loadingOlder, onLoadOlder]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICK_TO_BOTTOM_PX;
    if (atBottom.current) setUnseen(0);
    snapshot.current.scrollTop = element.scrollTop;
    snapshot.current.scrollHeight = element.scrollHeight;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain py-2"
        data-testid="chat-scroller"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Tin nhắn trong phòng"
      >
        <div ref={top} aria-hidden="true" />
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <Spinner label="Đang tải tin nhắn cũ" />
          </div>
        )}
        {!hasOlder && messages.length > 0 && (
          <p className="py-4 text-center text-xs text-muted">
            Đây là đầu cuộc trò chuyện.
          </p>
        )}
        <ol>
          {rows.map(({ message, dayDivider, showHeader }) => (
            <DayGroup key={message.id} divider={dayDivider}>
              <ChatMessageItem
                message={message}
                showHeader={showHeader}
                own={message.sender.id === viewer.id}
                showStatus={viewer.isModerator}
                actions={messageActions(message, viewer)}
                onAction={onAction}
              />
            </DayGroup>
          ))}
        </ol>
      </div>
      {unseen > 0 && (
        <Button
          size="sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg"
          onClick={scrollToBottom}
          data-testid="chat-new-messages"
        >
          <ArrowDown className="size-4" aria-hidden="true" />
          {unseen} tin nhắn mới
        </Button>
      )}
    </div>
  );
}

function DayGroup({
  divider,
  children,
}: {
  divider: string | null;
  children: ReactNode;
}) {
  if (!divider) return children;
  return (
    <>
      <li
        role="separator"
        aria-label={divider}
        className="my-4 flex items-center gap-3 px-4 text-xs font-medium text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
      >
        {divider}
      </li>
      {children}
    </>
  );
}
