import { CheckCircle2, Clock, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceState } from "./api";

const minutes = (seconds: number) => Math.floor(seconds / 60);

/**
 * The learner's running attendance, pinned to a corner: credited minutes
 * against the target, amber until it is reached, then green with a check.
 */
export function AttendanceIndicator({
  attendance,
  paused,
}: {
  attendance: AttendanceState;
  paused: boolean;
}) {
  const done = attendance.isAttended;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="attendance-indicator"
      data-attended={done}
      className={cn(
        "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg",
        done
          ? "bg-success-background text-success-foreground"
          : "bg-warning-background text-warning-foreground",
      )}
    >
      {done ? (
        <CheckCircle2 className="size-4" aria-hidden="true" />
      ) : paused ? (
        <PauseCircle className="size-4" aria-hidden="true" />
      ) : (
        <Clock className="size-4" aria-hidden="true" />
      )}
      <span>
        Đã tham gia: {minutes(attendance.durationSeconds)} phút / Target:{" "}
        {Math.ceil(attendance.requiredSeconds / 60)} phút
      </span>
      <span className="font-semibold">
        · {done ? "Đã điểm danh" : paused ? "Tạm dừng (tab đang ẩn)" : "Chưa đủ thời lượng"}
      </span>
    </div>
  );
}
