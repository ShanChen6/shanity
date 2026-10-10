import type { EventInput } from "@fullcalendar/core";
import type { ScheduleSession, ScheduleStatus } from "./api";

/** Theme tokens, so the calendar follows light and dark mode. */
export const STATUS_STYLE: Record<
  ScheduleStatus,
  { label: string; color: string; classNames: string[] }
> = {
  SCHEDULED: { label: "Sắp diễn ra", color: "var(--color-info)", classNames: ["live-scheduled"] },
  LIVE: {
    label: "Đang phát trực tiếp",
    color: "var(--color-danger)",
    // Blinks: a class happening now must catch the eye.
    classNames: ["live-now", "animate-pulse"],
  },
  ENDED: { label: "Đã kết thúc", color: "var(--color-muted)", classNames: ["live-ended"] },
  CANCELLED: {
    label: "Đã hủy",
    color: "var(--color-warning)",
    classNames: ["live-cancelled", "line-through"],
  },
};

/** API sessions as FullCalendar events (times stay ISO; shown in local time). */
export function toCalendarEvents(sessions: readonly ScheduleSession[]): EventInput[] {
  return sessions.map((session) => {
    const style = STATUS_STYLE[session.status];
    return {
      id: session.id,
      title: `${session.title} · ${session.courseName}`,
      start: session.startTime,
      end: session.endTime,
      backgroundColor: style.color,
      borderColor: style.color,
      textColor: "var(--color-primary-foreground)",
      classNames: style.classNames,
      extendedProps: { session },
    };
  });
}

/** Whether "Vào phòng học ngay" makes sense yet. */
export const canEnter = (status: ScheduleStatus) => status !== "CANCELLED";
