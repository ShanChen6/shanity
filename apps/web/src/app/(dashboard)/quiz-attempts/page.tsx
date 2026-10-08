import type { Metadata } from "next";
import { MyQuizAttempts } from "@/features/standalone-quiz/MyQuizAttempts";

export const metadata: Metadata = {
  title: "Lịch sử làm bài · Shanity",
  robots: { index: false },
};

export default function Page() {
  return <MyQuizAttempts />;
}
