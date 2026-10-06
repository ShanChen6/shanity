import type { Metadata } from "next";
import { MyLearning } from "@/features/progress/my-learning";

export const metadata: Metadata = {
  title: "Góc học tập · Shanity",
  robots: { index: false },
};

export default function MyLearningPage() {
  return <MyLearning />;
}
