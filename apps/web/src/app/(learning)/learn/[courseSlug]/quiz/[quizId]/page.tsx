import type { Metadata } from "next";
import { QuizPlayer } from "@/components/learning/quiz/QuizPlayer";

export const metadata: Metadata = { title: "Quiz | Shanity" };

export default async function QuizPage({
  params,
  searchParams,
}: PageProps<"/learn/[courseSlug]/quiz/[quizId]">) {
  const { quizId } = await params;
  const { result } = await searchParams;
  return (
    <QuizPlayer
      quizId={quizId}
      resultAttemptId={typeof result === "string" ? result : undefined}
    />
  );
}
