import type { Metadata } from "next";
import { Profile } from "@/features/auth/profile";
export const metadata: Metadata = {
  title: "Hồ sơ · Shanity",
  robots: { index: false },
};
export default function ProfilePage() {
  return <Profile />;
}
