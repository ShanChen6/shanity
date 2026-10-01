import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col items-center px-6 py-12 text-center ${className}`}
    >
      {icon && (
        <span aria-hidden="true" className="mb-4 text-muted">
          {icon}
        </span>
      )}
      <h2 className="font-heading text-h3 font-semibold">{title}</h2>
      {description && (
        <p className="mt-2 max-w-md text-body-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
