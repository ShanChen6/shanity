"use client";

import { CreditCard, Landmark, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PROVIDER_META } from "./order-model";
import type { PaymentMethod, PaymentProvider } from "./types";

const ICONS: Record<PaymentProvider, typeof Landmark> = {
  VIETQR: Landmark,
  STRIPE: CreditCard,
  MOMO: Wallet,
  VNPAY: Wallet,
  MANUAL_BANK: Landmark,
};

// Gateways offered at checkout, in display order.
export const SELECTABLE_PROVIDERS: PaymentProvider[] = [
  "VIETQR",
  "STRIPE",
  "MOMO",
  "VNPAY",
];

export function isSelectable(method: PaymentMethod | undefined) {
  return Boolean(method?.available && method.supportsCurrency);
}

function reason(method: PaymentMethod | undefined) {
  if (!method || !method.registered) return "Sắp ra mắt";
  if (!method.available) return "Tạm thời chưa khả dụng";
  if (!method.supportsCurrency) return "Không hỗ trợ loại tiền này";
  return null;
}

/** Radio-card group; unavailable gateways stay visible but disabled. */
export function PaymentMethods({
  methods,
  loading,
  value,
  onChange,
  disabled,
}: {
  methods: PaymentMethod[] | undefined;
  loading: boolean;
  value: PaymentProvider | null;
  onChange: (provider: PaymentProvider) => void;
  disabled?: boolean;
}) {
  if (loading)
    return (
      <div className="space-y-2" aria-label="Đang tải phương thức thanh toán">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-body-sm font-semibold">
        Chọn phương thức thanh toán
      </legend>
      {SELECTABLE_PROVIDERS.map((provider) => {
        const method = methods?.find((item) => item.provider === provider);
        const selectable = isSelectable(method);
        const note = reason(method);
        const Icon = ICONS[provider];
        const selected = value === provider;
        return (
          <label
            key={provider}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors",
              selected
                ? "border-primary bg-accent/40"
                : "border-border bg-surface",
              selectable
                ? "cursor-pointer hover:border-border-strong"
                : "cursor-not-allowed opacity-55",
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value={provider}
              checked={selected}
              disabled={!selectable || disabled}
              onChange={() => onChange(provider)}
              className="size-4 accent-[var(--primary)]"
            />
            <Icon aria-hidden size={20} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold">
                {PROVIDER_META[provider].label}
              </span>
              <span className="block text-caption text-muted">
                {note ?? PROVIDER_META[provider].description}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
