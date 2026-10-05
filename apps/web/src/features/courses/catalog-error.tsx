"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function CatalogError({ message }: { message: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <section
      className="mx-auto flex max-w-xl flex-col items-center px-5 py-16 text-center sm:py-24"
      role="alert"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-background text-danger">
        <Icon name="info" className="size-7" />
      </span>
      <h2 className="mt-5 font-heading text-h3 font-semibold">
        Chưa tải được danh sách
      </h2>
      <p className="mt-2 text-body-sm text-muted">{message}</p>
      <Button
        className="mt-6"
        loading={isPending}
        loadingLabel="Đang thử lại…"
        onClick={() => startTransition(() => router.refresh())}
      >
        <Icon name="refresh" />
        Thử lại
      </Button>
    </section>
  );
}
