import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "./order-model";
import type { OrderStatus } from "./types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
