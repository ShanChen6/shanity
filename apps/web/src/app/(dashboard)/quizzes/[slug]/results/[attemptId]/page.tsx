import type { Metadata } from "next";
import { StandaloneResult } from "@/features/standalone-quiz/StandaloneResult";

export const metadata: Metadata = { title: "Kết quả | Shanity" };

export default async function Page({
  params,
}: PageProps<"/quizzes/[slug]/results/[attemptId]">) {
  const { slug, attemptId } = await params;
  return <StandaloneResult slug={slug} attemptId={attemptId} />;
}
