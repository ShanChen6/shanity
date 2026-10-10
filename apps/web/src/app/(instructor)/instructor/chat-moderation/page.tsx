import type { Metadata } from "next";
import { ModerationQueue } from "@/features/chat/ModerationQueue";

export const metadata: Metadata = { title: "Kiểm duyệt thảo luận | Shanity" };

export default function Page() {
  return <ModerationQueue />;
}
