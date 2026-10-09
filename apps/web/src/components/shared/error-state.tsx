import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorState({
  title,
  description,
  action,
  reference,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Request id to quote to support, e.g. the API's X-Correlation-Id. */
  reference?: string;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={cn(
        "rounded-md border border-danger bg-danger-background p-5",
        className,
      )}
    >
      <h2 className="font-heading text-h3 font-semibold text-danger-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-body-sm text-danger-foreground">
          {description}
        </p>
      )}
      {reference && (
        <p className="mt-2 text-caption text-danger-foreground">
          Mã tham chiếu: <code className="font-mono">{reference}</code>
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
