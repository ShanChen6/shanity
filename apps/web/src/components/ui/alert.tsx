import type { ComponentPropsWithoutRef } from "react";
import { Icon } from "./icon";
const tones = {
  info: "bg-info-background text-info-foreground",
  success: "bg-success-background text-success-foreground",
  warning: "bg-warning-background text-warning-foreground",
  error: "bg-danger-background text-danger-foreground",
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
      className={`flex items-start gap-3 rounded-md p-3.5 text-sm ${tones[tone]} ${className}`}
    >
      <Icon name={tone === "success" ? "check" : "info"} className="mt-0.5" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
