import type { ComponentPropsWithoutRef } from "react";
import { Icon } from "./icon";
const tones = {
  info: "bg-surface-muted text-foreground",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-danger-bg text-danger",
};
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
      role={tone === "error" ? "alert" : "status"}
      {...props}
      className={`flex items-start gap-3 rounded-control p-3.5 text-sm ${tones[tone]} ${className}`}
    >
      <Icon name={tone === "success" ? "check" : "info"} className="mt-0.5" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
