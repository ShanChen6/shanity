import { requireUser } from "@/lib/server-session";
import type { Metadata } from "next";
import { Profile } from "@/features/auth/profile";
export const metadata: Metadata = {
  title: "Hồ sơ · Shanity",
  robots: { index: false },
};
export default async function ProfilePage() {
  await requireUser();
  return <Profile />;
}
