import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CheckoutSkeleton,
  CheckoutView,
} from "@/features/payments/checkout-view";

export const metadata: Metadata = {
  title: "Thanh toán · Shanity",
  robots: { index: false, follow: false },
};

// A malformed %-escape in the URL must be a 404 path, not a thrown URIError.
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function CheckoutPage({
  params,
}: PageProps<"/checkout/[orderCode]">) {
  const { orderCode } = await params;
  return (
    <main className="container flex-1 py-8 sm:py-12">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutView orderCode={safeDecode(orderCode)} />
      </Suspense>
    </main>
  );
}
