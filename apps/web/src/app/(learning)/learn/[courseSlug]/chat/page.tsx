import type { Metadata } from "next";
import { CourseChatPage } from "@/features/chat/CourseChatPage";

export const metadata: Metadata = { title: "Thảo luận | Shanity" };

export default function ChatPage() {
  return <CourseChatPage />;
}
