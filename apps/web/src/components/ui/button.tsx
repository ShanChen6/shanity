import type { ComponentPropsWithRef } from "react";
import { Spinner } from "./spinner";

const variants = {
  primary:
    "border-transparent bg-primary text-primary-foreground enabled:hover:bg-primary-hover",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground enabled:hover:bg-secondary-hover",
  outline:
    "border-border-strong bg-transparent text-foreground enabled:hover:bg-surface-hover",
  ghost: "border-transparent text-primary enabled:hover:bg-surface-hover",
  danger:
    "border-transparent bg-danger-foreground text-danger-background enabled:hover:opacity-90",
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
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-md border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${sizes[size]} ${variants[variant]} ${className}`}
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
