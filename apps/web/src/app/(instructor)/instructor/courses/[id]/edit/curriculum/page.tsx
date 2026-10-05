import { Curriculum } from "@/features/instructor/curriculum";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Curriculum id={id} />;
}
