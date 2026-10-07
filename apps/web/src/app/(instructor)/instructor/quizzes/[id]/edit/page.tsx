import { QuizBuilder } from "@/features/quiz-builder/QuizBuilder";

export default async function Page({
  params,
}: PageProps<"/instructor/quizzes/[id]/edit">) {
  const { id } = await params;
  return <QuizBuilder quizId={id} />;
}
