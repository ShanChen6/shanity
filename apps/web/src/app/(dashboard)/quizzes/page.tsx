import type { Metadata } from "next";
import { QuizHub } from "@/features/standalone-quiz/QuizHub";

export const metadata: Metadata = {
  title: "Quiz | Shanity",
  description: "Thử thách kiến thức với các bài quiz độc lập.",
};

export default function Page() {
  return <QuizHub />;
}
