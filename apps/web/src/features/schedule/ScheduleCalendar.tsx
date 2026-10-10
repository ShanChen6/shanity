"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import viLocale from "@fullcalendar/core/locales/vi";
import type { EventClickArg, EventSourceFuncArg } from "@fullcalendar/core";
import { CalendarClock, Radio, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { fetchMySchedule, type ScheduleSession } from "./api";
import { STATUS_STYLE, canEnter, toCalendarEvents } from "./schedule-model";

/** Statuses move with the clock: the calendar re-reads this often. */
export const SCHEDULE_REFRESH_MS = 60_000;

const time = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const clock = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

// FullCalendar's own CSS variables, mapped onto the theme.
const THEME = {
  "--fc-border-color": "var(--color-border)",
  "--fc-page-bg-color": "var(--color-surface)",
  "--fc-neutral-bg-color": "var(--color-surface-secondary)",
  "--fc-today-bg-color": "color-mix(in oklab, var(--color-primary) 10%, transparent)",
  "--fc-button-bg-color": "var(--color-primary)",
  "--fc-button-border-color": "var(--color-primary)",
  "--fc-button-hover-bg-color": "var(--color-primary-hover)",
  "--fc-button-hover-border-color": "var(--color-primary-hover)",
  "--fc-button-active-bg-color": "var(--color-primary-active)",
  "--fc-button-active-border-color": "var(--color-primary-active)",
  "--fc-button-text-color": "var(--color-primary-foreground)",
  "--fc-now-indicator-color": "var(--color-danger)",
} as CSSProperties;

/**
 * The signed-in user's live classes on a calendar (month, week, day), in
 * the device's time zone. Only what the API returns is shown: learners see
 * their enrolled courses, teachers what they teach. A click opens the
 * session's details with a way in.
 */
export function ScheduleCalendar() {
  const calendar = useRef<FullCalendar>(null);
  const [selected, setSelected] = useState<ScheduleSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phones start on the day, larger screens on the month.
  const [initialView] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches
      ? "timeGridDay"
      : "dayGridMonth",
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => calendar.current?.getApi().refetchEvents(),
      SCHEDULE_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  async function loadEvents(range: EventSourceFuncArg) {
    try {
      const { sessions } = await fetchMySchedule(range.start.toISOString(), range.end.toISOString());
      setError(null);
      return toCalendarEvents(sessions);
    } catch (cause) {
      setError(errorMessage(cause));
      return [];
    }
  }

  function onEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelected(info.event.extendedProps.session as ScheduleSession);
  }

  return (
    <div className="space-y-3" data-testid="schedule-calendar">
      {error && (
        <p role="alert" className="rounded-md bg-danger-background px-3 py-2 text-sm text-danger-foreground">
          {error}
        </p>
      )}
      <div
        style={THEME}
        className="rounded-lg border border-border bg-surface p-2 text-sm sm:p-4 [&_.fc-button]:text-xs sm:[&_.fc-button]:text-sm [&_.fc-event]:cursor-pointer [&_.fc-event-time]:shrink-0 [&_.fc-toolbar-title]:text-base sm:[&_.fc-toolbar-title]:text-xl [&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-2"
      >
        <FullCalendar
          ref={calendar}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={viLocale}
          timeZone="local"
          initialView={initialView}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height="auto"
          nowIndicator
          dayMaxEvents={3}
          // Coloured blocks in every view (the month view defaults to dots).
          eventDisplay="block"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={loadEvents}
          eventClick={onEventClick}
        />
      </div>
      <Legend />
      {selected && <SessionDialog session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted" aria-label="Chú thích màu">
      {Object.values(STATUS_STYLE).map((style) => (
        <li key={style.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ background: style.color }} />
          {style.label}
        </li>
      ))}
    </ul>
  );
}

function SessionDialog({ session, onClose }: { session: ScheduleSession; onClose: () => void }) {
  const style = STATUS_STYLE[session.status];
  return (
    <Dialog title={session.title} description={session.courseName} onClose={onClose}>
      <div className="space-y-3 text-sm" data-testid="schedule-session">
        <Badge
          tone={session.status === "LIVE" ? "danger" : session.status === "SCHEDULED" ? "info" : "neutral"}
        >
          {session.status === "LIVE" && <Radio className="mr-1 size-3.5" aria-hidden="true" />}
          {style.label}
        </Badge>
        <p className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted" aria-hidden="true" />
          {time.format(new Date(session.startTime))} – {clock.format(new Date(session.endTime))}
        </p>
        <p className="flex items-center gap-2">
          <User className="size-4 text-muted" aria-hidden="true" />
          {session.instructorName}
          {session.role === "instructor" && <span className="text-muted">(bạn giảng dạy)</span>}
        </p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-hover">
          Đóng
        </button>
        {canEnter(session.status) && (
          <Link
            href={session.liveClassUrl}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            {session.status === "ENDED" ? "Xem lại buổi học" : "Vào phòng học ngay"}
          </Link>
        )}
      </div>
    </Dialog>
  );
}
