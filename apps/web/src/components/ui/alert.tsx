import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
const tones = {
  info: "bg-info-background text-info-foreground",
  success: "bg-success-background text-success-foreground",
  warning: "bg-warning-background text-warning-foreground",
  danger: "bg-danger-background text-danger-foreground",
  error: "bg-danger-background text-danger-foreground",
};

export function AlertTitle({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return <p {...props} className={cn("font-semibold", className)} />;
}

export function AlertDescription({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={cn("mt-1", className)} />;
}
export function Alert({
  tone = "info",
  title,
  children,
  className = "",
  ...props
}: Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  tone?: keyof typeof tones;
  title?: string;
}) {
  return (
    <div
      role={tone === "error" || tone === "danger" ? "alert" : "status"}
      {...props}
      className={cn(
        "flex items-start gap-3 rounded-md p-3.5 text-sm",
        tones[tone],
        className,
      )}
    >
      <Icon name={tone === "success" ? "check" : "info"} className="mt-0.5" />
      <div className="min-w-0">
        {title && <AlertTitle>{title}</AlertTitle>}
        {children}
      </div>
    </div>
  );
}
