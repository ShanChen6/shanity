import type { Metadata } from "next";
import { StandaloneAttempt } from "@/features/standalone-quiz/StandaloneAttempt";

export const metadata: Metadata = { title: "Làm bài | Shanity" };

export default async function Page({
  params,
}: PageProps<"/quizzes/[slug]/attempt">) {
  const { slug } = await params;
  return <StandaloneAttempt slug={slug} />;
}
