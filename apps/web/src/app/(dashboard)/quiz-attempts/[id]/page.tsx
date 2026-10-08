import type { Metadata } from "next";
import { StandaloneResult } from "@/features/standalone-quiz/StandaloneResult";

export const metadata: Metadata = {
  title: "Kết quả bài làm · Shanity",
  robots: { index: false },
};

export default async function Page({
  params,
}: PageProps<"/quiz-attempts/[id]">) {
  const { id } = await params;
  return <StandaloneResult attemptId={id} />;
}
