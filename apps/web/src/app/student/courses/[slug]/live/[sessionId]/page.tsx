import type { Metadata } from "next";
import { SiteShell } from "@/components/layout/site-shell";
import { LiveSessionWorkspace } from "@/features/live/LiveSessionWorkspace";

export const metadata: Metadata = {
  title: "Lớp học trực tiếp | Shanity",
  // Members-only page: nothing for search engines.
  robots: { index: false, follow: false },
};

export default async function LiveSessionPage({
  params,
}: PageProps<"/student/courses/[slug]/live/[sessionId]">) {
  const { slug, sessionId } = await params;
  return (
    <SiteShell>
      <LiveSessionWorkspace courseSlug={slug} sessionId={sessionId} />
    </SiteShell>
  );
}
