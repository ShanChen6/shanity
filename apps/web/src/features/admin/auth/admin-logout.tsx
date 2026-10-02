"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/features/auth/session-provider";

export function AdminLogout() {
  const session = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await session.logout();
      router.replace("/admin/login");
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="relative shrink-0">
      <Button
        variant="ghost"
        aria-label="Đăng xuất quản trị"
        loading={busy}
        loadingLabel="Đang thoát…"
        onClick={() => void logout()}
      >
        Đăng xuất
      </Button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-danger bg-danger-background p-3 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}
    </div>
  );
}
