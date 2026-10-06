import type { ComponentPropsWithRef } from "react";

export function Progress({
  value,
  max = 100,
  label = "Tiến độ",
  className = "",
  indicatorClassName = "bg-course-progress",
  ...props
}: Omit<ComponentPropsWithRef<"div">, "role" | "aria-valuenow"> & {
  value?: number;
  max?: number;
  label?: string;
  indicatorClassName?: string;
}) {
  const safeMax = Math.max(1, max);
  const boundedValue =
    value === undefined ? undefined : Math.min(safeMax, Math.max(0, value));
  const percentage =
    boundedValue === undefined ? undefined : (boundedValue / safeMax) * 100;

  return (
    <div
      {...props}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={boundedValue}
      className={`h-2 overflow-hidden rounded-full bg-surface-secondary ${className}`}
    >
      <div
        className={`h-full rounded-full ${indicatorClassName} transition-[width] motion-reduce:transition-none ${value === undefined ? "w-1/3 animate-pulse" : ""}`}
        style={
          percentage === undefined ? undefined : { width: `${percentage}%` }
        }
      />
    </div>
  );
}
