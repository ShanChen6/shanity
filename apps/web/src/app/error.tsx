"use client";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="container py-16">
      <p>Không thể tải trang. Vui lòng thử lại.</p>
      <Button onClick={reset}>Thử lại</Button>
    </main>
  );
}
