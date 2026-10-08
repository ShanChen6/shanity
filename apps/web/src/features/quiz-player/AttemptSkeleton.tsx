import { Skeleton } from "@/components/ui/skeleton";

/** The exam screen's shape while the attempt opens: header, question, navigator. */
export function AttemptSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Đang mở bài làm"
      data-testid="attempt-skeleton"
      className="flex min-h-full flex-col"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4 rounded-lg border border-border p-6">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="size-9" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
