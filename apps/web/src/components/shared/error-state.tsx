import type { ReactNode } from "react";

export function ErrorState({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={`rounded-md border border-danger bg-danger-background p-5 ${className}`}
    >
      <h2 className="font-heading text-h3 font-semibold text-danger-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-body-sm text-danger-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
