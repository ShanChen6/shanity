import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
const variants = {
  default: "border-border bg-surface shadow-sm",
  interactive:
    "border-border bg-surface shadow-sm transition-colors hover:border-border-strong hover:bg-surface-hover",
  elevated: "border-border bg-surface-elevated shadow-md",
};
export function Card({
  variant = "default",
  className = "",
  ...props
}: ComponentPropsWithRef<"div"> & { variant?: keyof typeof variants }) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-lg border p-5 sm:p-6",
        variants[variant],
        className,
      )}
    />
  );
}

export function CardHeader({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div {...props} className={cn("mb-4 flex flex-col gap-1.5", className)} />
  );
}

export function CardTitle({
  className = "",
  ...props
}: ComponentPropsWithRef<"h3">) {
  return (
    <h3
      {...props}
      className={cn("font-heading text-h3 font-semibold", className)}
    />
  );
}

export function CardDescription({
  className = "",
  ...props
}: ComponentPropsWithRef<"p">) {
  return <p {...props} className={cn("text-body-sm text-muted", className)} />;
}

export function CardContent({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return <div {...props} className={cn(className)} />;
}

export function CardFooter({
  className = "",
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "mt-4 flex items-center border-t border-border pt-4",
        className,
      )}
    />
  );
}
