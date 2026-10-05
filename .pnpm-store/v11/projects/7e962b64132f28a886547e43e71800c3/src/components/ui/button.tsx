import type { ComponentPropsWithRef } from "react";
import { Spinner } from "./spinner";

const variants = {
  primary:
    "border-transparent bg-primary text-primary-foreground enabled:hover:bg-primary-hover enabled:active:bg-primary-active",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground enabled:hover:bg-secondary-hover enabled:active:bg-surface-active",
  outline:
    "border-border-strong bg-transparent text-foreground enabled:hover:bg-surface-hover enabled:active:bg-surface-active",
  ghost:
    "border-transparent text-primary enabled:hover:bg-surface-hover enabled:active:bg-surface-active",
  danger:
    "border-transparent bg-danger-foreground text-danger-background enabled:hover:opacity-90 enabled:active:opacity-80",
  link: "h-auto min-h-0 border-transparent p-0 text-primary underline-offset-4 hover:underline enabled:active:text-primary-active",
};
const sizes = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "control px-4 py-2.5 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
  icon: "size-11 p-0",
};
export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  loadingLabel?: string;
};
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Đang xử lý…",
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const sizeClass = variant === "link" ? "" : sizes[size];

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-md border font-semibold transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-55 ${sizeClass} ${variants[variant]} ${className}`}
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
