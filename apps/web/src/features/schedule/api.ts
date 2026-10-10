import { api } from "@/lib/api";

export type ScheduleStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

/** One entry of GET /api/v1/live-sessions/my-schedule. */
export type ScheduleSession = {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  courseSlug: string;
  instructorName: string;
  startTime: string;
  endTime: string;
  status: ScheduleStatus;
  provider: string;
  role: "student" | "instructor";
  /** The session page in this app. */
  liveClassUrl: string;
};

export const fetchMySchedule = (startDate: string, endDate: string, signal?: AbortSignal) =>
  api<{ serverTime: string; sessions: ScheduleSession[] }>(
    `/api/v1/live-sessions/my-schedule?${new URLSearchParams({ startDate, endDate })}`,
    { signal },
  );
