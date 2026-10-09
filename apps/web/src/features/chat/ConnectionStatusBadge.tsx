import { cn } from "@/lib/utils";
import {
  CONNECTION_LABELS,
  type ConnectionStatus,
} from "./connection-status";

const STYLES: Record<ConnectionStatus, { badge: string; dot: string }> = {
  connected: {
    badge: "bg-success-background text-success-foreground",
    dot: "bg-success-foreground",
  },
  connecting: {
    badge: "bg-warning-background text-warning-foreground",
    dot: "bg-warning-foreground animate-pulse",
  },
  reconnecting: {
    badge: "bg-warning-background text-warning-foreground",
    dot: "bg-warning-foreground animate-pulse",
  },
  disconnected: {
    badge: "bg-danger-background text-danger-foreground",
    dot: "bg-danger-foreground",
  },
};

/** Green connected, amber (re)connecting, red disconnected. */
export function ConnectionStatusBadge({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  const style = STYLES[status];
  return (
    <span
      role="status"
      aria-live="polite"
      data-status={status}
      data-testid="chat-connection-status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style.badge,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", style.dot)} />
      {CONNECTION_LABELS[status]}
    </span>
  );
}
