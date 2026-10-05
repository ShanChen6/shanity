import type { Metadata } from "next";
import { LessonContentViewer } from "@/components/learning/LessonContentViewer";

export const metadata: Metadata = { title: "Học tập | Shanity" };

export default async function LessonPage({
  params,
}: PageProps<"/learn/[courseSlug]/[lessonSlug]">) {
  const { lessonSlug } = await params;
  return <LessonContentViewer lessonSlug={lessonSlug} />;
}
