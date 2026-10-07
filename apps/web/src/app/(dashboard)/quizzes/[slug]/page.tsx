import type { Metadata } from "next";
import { QuizLanding } from "@/features/standalone-quiz/QuizLanding";

export const metadata: Metadata = { title: "Quiz | Shanity" };

export default async function Page({ params }: PageProps<"/quizzes/[slug]">) {
  const { slug } = await params;
  return <QuizLanding slug={slug} />;
}
