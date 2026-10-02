import { Skeleton } from "@/components/ui/skeleton";

export function CatalogSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      role="status"
      aria-label="Đang tải khóa học"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-4 p-4 sm:p-5">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Đang tải danh sách khóa học</span>
    </div>
  );
}
