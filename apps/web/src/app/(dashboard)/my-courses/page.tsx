import { redirect } from "next/navigation";

// Legacy route: the learner dashboard moved to /my-learning.
export default async function Page({ searchParams }: PageProps<"/my-courses">) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const item of [value ?? []].flat()) query.append(key, item);
  const search = query.toString();
  redirect(search ? `/my-learning?${search}` : "/my-learning");
}
