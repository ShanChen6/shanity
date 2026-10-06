import { Skeleton } from "@/components/ui/skeleton";

export function LearningSkeletonLoader() {
  return (
    <div
      role="status"
      aria-label="Đang tải giao diện học tập"
      className="grid min-h-[70dvh] grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]"
    >
      <div className="hidden space-y-4 border-r border-border p-4 lg:block">
        {[0, 1, 2].map((chapter) => (
          <div key={chapter} className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-11/12" />
          </div>
        ))}
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <span className="sr-only">Đang tải nội dung và giáo trình…</span>
    </div>
  );
}
