"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { errorMessage } from "@/lib/api";
import { fetchAttendanceReport } from "./api";

const clock = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)} phút ${String(seconds % 60).padStart(2, "0")} giây`;

/** Teachers: who is (or was) in the class, refreshed while it runs. */
export function AttendanceReport({ courseId, sessionId }: { courseId: string; sessionId: string }) {
  const report = useQuery({
    queryKey: ["live", "attendance-report", sessionId],
    queryFn: ({ signal }) => fetchAttendanceReport(courseId, sessionId, signal),
    refetchInterval: 30_000,
  });
  return (
    <section className="rounded-lg border border-border bg-surface p-5" aria-labelledby="attendance-report-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attendance-report-title" className="font-semibold">
          Điểm danh
        </h2>
        {report.data && (
          <p className="text-sm text-muted">
            Có mặt {report.data.summary.present}/{report.data.summary.total} · cần tối thiểu{" "}
            {Math.ceil(report.data.requiredSeconds / 60)} phút ({report.data.thresholdPercent}% thời lượng)
          </p>
        )}
      </div>
      {report.isPending ? (
        <p role="status" className="mt-3 text-sm text-muted">Đang tải…</p>
      ) : report.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-foreground">{errorMessage(report.error)}</p>
      ) : report.data.students.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Khóa học chưa có học viên.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm" data-testid="attendance-report">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Học viên</th>
                <th className="py-2 pr-3 font-medium">Thời lượng</th>
                <th className="py-2 pr-3 font-medium">Vào / hoạt động cuối</th>
                <th className="py-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {report.data.students.map((student) => (
                <tr key={student.studentId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{student.name}</p>
                    <p className="text-xs text-muted">{student.email}</p>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{duration(student.durationSeconds)}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted">
                    {student.firstJoinedAt
                      ? `${clock.format(new Date(student.firstJoinedAt))} – ${clock.format(new Date(student.lastActiveAt!))}`
                      : "—"}
                  </td>
                  <td className="py-2">
                    <Badge tone={student.status === "PRESENT" ? "success" : "neutral"}>
                      {student.status === "PRESENT" ? "Có mặt" : "Vắng"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
