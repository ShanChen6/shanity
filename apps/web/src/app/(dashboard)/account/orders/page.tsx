import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrdersHistory } from "@/features/payments/orders-history";

export const metadata: Metadata = {
  title: "Đơn hàng của tôi · Shanity",
  robots: { index: false, follow: false },
};

export default function AccountOrdersPage() {
  return (
    <Suspense
      fallback={
        <main className="container flex-1 py-8 sm:py-12">
          <Skeleton className="h-64" />
        </main>
      }
    >
      <OrdersHistory />
    </Suspense>
  );
}
