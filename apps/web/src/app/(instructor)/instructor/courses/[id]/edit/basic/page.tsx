import { BasicEditor } from "@/features/instructor/basic-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BasicEditor id={id} />;
}
