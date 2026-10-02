import { Preview } from "@/features/instructor/preview";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Preview id={id} />;
}
