import type { Metadata } from "next";
import { InstructorDashboard } from "@/features/instructor/dashboard";

export const metadata: Metadata = {
  title: "Tổng quan giảng viên · Shanity",
  robots: { index: false },
};

export default function Page() {
  return <InstructorDashboard />;
}
