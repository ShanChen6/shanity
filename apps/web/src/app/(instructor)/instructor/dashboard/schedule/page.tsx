import type { Metadata } from "next";
import { ScheduleCalendar } from "@/features/schedule/ScheduleCalendar";

export const metadata: Metadata = { title: "Lịch giảng dạy | Shanity" };

export default function InstructorSchedulePage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-heading text-h2 font-bold">Lịch giảng dạy</h1>
        <p className="text-muted">Các buổi học trực tiếp trong những khóa bạn phụ trách.</p>
      </header>
      <ScheduleCalendar />
    </div>
  );
}
