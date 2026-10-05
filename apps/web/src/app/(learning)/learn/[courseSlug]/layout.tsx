import { LearningShell } from "@/components/learning/LearningShell";

export default async function LearningLayout({
  children,
  params,
}: LayoutProps<"/learn/[courseSlug]">) {
  const { courseSlug } = await params;
  return <LearningShell courseSlug={courseSlug}>{children}</LearningShell>;
}
