import { formatMoney, formatTimestamp } from "./format";
import { ProofLink } from "./proof-link";
import { DetailSection } from "./detail-sections";
import { providerLabel, TIMELINE_TITLES, TIMELINE_TONES } from "./order-model";
import type { OrderCurrency, TimelineEvent } from "./types";
import { cn } from "@/lib/utils";

const DOT = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  neutral: "bg-border-strong",
} as const;

function reconciledProof(event: TimelineEvent) {
  const reconciliation = event.payload?.reconciliation;
  return typeof reconciliation === "object" && reconciliation !== null
    ? (reconciliation as Record<string, unknown>).proofImageUrl
    : null;
}

function EventDetails({
  event,
  currency,
}: {
  event: TimelineEvent;
  currency: OrderCurrency;
}) {
  const lines: string[] = [];
  if (event.provider) lines.push(providerLabel(event.provider));
  if (event.amount != null) lines.push(formatMoney(event.amount, currency));
  if (event.courseTitle) lines.push(event.courseTitle);
  return (
    <>
      {lines.length > 0 && (
        <p className="text-sm [overflow-wrap:anywhere]">{lines.join(" · ")}</p>
      )}
      {event.providerTransactionId && (
        <p className="text-xs text-muted">
          Mã giao dịch:{" "}
          <span className="break-all font-mono">
            {event.providerTransactionId}
          </span>
        </p>
      )}
      {event.actorEmail && (
        <p className="text-xs text-muted">
          Thực hiện bởi:{" "}
          <span className="break-all font-medium">{event.actorEmail}</span>
        </p>
      )}
      {event.note && (
        <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-secondary/60 p-2 text-sm [overflow-wrap:anywhere]">
          {event.note}
        </p>
      )}
      {event.type === "MANUAL_RECONCILED" && (
        <ProofLink url={reconciledProof(event)} />
      )}
    </>
  );
}

export function OrderTimeline({
  events,
  currency,
}: {
  events: TimelineEvent[];
  currency: OrderCurrency;
}) {
  return (
    <DetailSection id="order-timeline" title="Dòng thời gian">
      <ol className="relative ml-2 space-y-5 border-l border-border pl-5">
        {events.map((event, index) => (
          <li key={`${event.type}-${event.at}-${index}`} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-surface",
                DOT[TIMELINE_TONES[event.type]],
              )}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-semibold">{TIMELINE_TITLES[event.type]}</p>
              <time dateTime={event.at} className="text-xs text-muted">
                {formatTimestamp(event.at)}
              </time>
            </div>
            <EventDetails event={event} currency={currency} />
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}
