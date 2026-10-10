import { api } from "@/lib/api";
import type { LiveSessionList, LiveSessionResponse } from "./types";

const enc = encodeURIComponent;

export const liveKeys = {
  session: (id: string) => ["live", "session", id] as const,
  course: (courseId: string) => ["live", "course", courseId] as const,
};

export const fetchLiveSession = (id: string, signal?: AbortSignal) =>
  api<LiveSessionResponse>(`/api/v1/live-sessions/${enc(id)}`, { signal });

export const fetchCourseLiveSessions = (courseId: string, signal?: AbortSignal) =>
  api<LiveSessionList>(`/api/v1/courses/${enc(courseId)}/live-sessions`, { signal });

export const liveSessionHref = (courseSlug: string, sessionId: string) =>
  `/student/courses/${enc(courseSlug)}/live/${enc(sessionId)}`;

/** The server's view of a student's attendance (it alone credits time). */
export type AttendanceState = {
  durationSeconds: number;
  requiredSeconds: number;
  isAttended: boolean;
};
export type HeartbeatResult = AttendanceState & { accepted: boolean };

export const sendHeartbeat = (sessionId: string) =>
  api<HeartbeatResult>(`/api/v1/live-sessions/${enc(sessionId)}/heartbeat`, {
    method: "POST",
  });

export const fetchMyAttendance = (sessionId: string, signal?: AbortSignal) =>
  api<AttendanceState>(`/api/v1/live-sessions/${enc(sessionId)}/attendance/me`, { signal });

export type AttendanceReport = {
  sessionId: string;
  thresholdPercent: number;
  requiredSeconds: number;
  summary: { total: number; present: number; absent: number };
  students: Array<{
    studentId: string;
    name: string;
    email: string;
    enrolled: boolean;
    durationSeconds: number;
    isAttended: boolean;
    status: "PRESENT" | "ABSENT";
    firstJoinedAt: string | null;
    lastActiveAt: string | null;
  }>;
};

export const fetchAttendanceReport = (courseId: string, sessionId: string, signal?: AbortSignal) =>
  api<AttendanceReport>(
    `/api/v1/courses/${enc(courseId)}/live-sessions/${enc(sessionId)}/attendance-report`,
    { signal },
  );
