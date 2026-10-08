import type { Metadata } from "next";
import { QuizList } from "@/features/quiz-builder/QuizList";

export const metadata: Metadata = {
  title: "Bài kiểm tra của khóa học · Shanity",
  robots: { index: false },
};

export default async function Page({
  params,
}: PageProps<"/instructor/courses/[id]/quizzes">) {
  const { id } = await params;
  return <QuizList courseId={id} />;
}
