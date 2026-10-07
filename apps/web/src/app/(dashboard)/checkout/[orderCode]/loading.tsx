import { CheckoutSkeleton } from "@/features/payments/checkout-view";

export default function Loading() {
  return (
    <main className="container flex-1 py-8 sm:py-12">
      <CheckoutSkeleton />
    </main>
  );
}
