import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { ScheduleCalendar } from "@/features/schedule/ScheduleCalendar";

export const metadata: Metadata = {
  title: "Lịch học | Shanity",
  robots: { index: false, follow: false },
};

export default function StudentSchedulePage() {
  return (
    <SiteShell>
      <main className="container space-y-6 py-8">
        <header>
          <h1 className="font-heading text-h2 font-bold">Lịch học trực tiếp</h1>
          <p className="text-muted">
            Các buổi học trực tiếp của những khóa bạn đang theo học, theo giờ trên thiết bị của bạn.
          </p>
        </header>
        <ScheduleCalendar />
      </main>
    </SiteShell>
  );
}
