import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Đang tải nội dung",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-32 flex-col items-center justify-center gap-3 text-center text-body-sm text-muted",
        className,
      )}
    >
      <Spinner decorative />
      <span>{label}</span>
    </div>
  );
}
