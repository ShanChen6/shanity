import { GradingWorkspace } from "@/features/grading-queue/GradingWorkspace";

export default async function Page({
  params,
}: PageProps<"/instructor/grading/attempts/[attemptId]">) {
  const { attemptId } = await params;
  return <GradingWorkspace attemptId={attemptId} />;
}
