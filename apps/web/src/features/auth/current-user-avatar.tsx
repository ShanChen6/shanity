"use client";
import { Avatar } from "@/components/ui/avatar";
import { API_URL } from "@/lib/api";
import { useSession } from "./session-provider";

export function CurrentUserAvatar({ className }: { className?: string }) {
  const { user } = useSession();
  // Only our managed API path; no arbitrary remote image hosts or optimizer proxy.
  const path = user?.avatarUrl;
  const src =
    path && /^\/avatars\/[0-9a-f-]{36}\.webp$/.test(path)
      ? `${API_URL}${path}`
      : undefined;
  return (
    <Avatar
      name={user?.displayName ?? "Tài khoản"}
      src={src}
      unoptimized
      className={className}
    />
  );
}
