import type { ComponentPropsWithRef } from "react";
import { Spinner } from "./spinner";

const variants = {
  primary:
    "border-transparent bg-primary text-on-primary enabled:hover:bg-primary-hover",
  secondary:
    "border-border bg-surface text-foreground enabled:hover:bg-surface-muted",
  ghost: "border-transparent text-primary enabled:hover:bg-surface-muted",
};
export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: keyof typeof variants;
  loading?: boolean;
  loadingLabel?: string;
};
export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Đang xử lý…",
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`control inline-flex min-w-0 items-center justify-center gap-2 rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${className}`}
    >
      {loading ? (
        <>
          <Spinner decorative />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
