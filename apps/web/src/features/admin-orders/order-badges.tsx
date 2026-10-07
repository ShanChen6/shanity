import { Badge } from "@/components/ui/badge";
import { ENROLLMENT_LABELS, providerLabel } from "./order-model";
import type { EnrollmentState, LedgerProvider } from "./types";

export { OrderStatusBadge } from "@/features/payments/status-badge";

export function ProviderBadge({
  provider,
}: {
  provider: LedgerProvider | null;
}) {
  if (!provider) return <span className="text-muted">—</span>;
  return (
    <Badge tone={provider === "MANUAL_RECONCILED" ? "warning" : "outline"}>
      {providerLabel(provider)}
    </Badge>
  );
}

export function EnrollmentBadge({ state }: { state: EnrollmentState }) {
  const meta = ENROLLMENT_LABELS[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
