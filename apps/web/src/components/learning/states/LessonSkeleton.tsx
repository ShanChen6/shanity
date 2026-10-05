import { Skeleton } from "@/components/ui/skeleton";

export function SidebarSkeleton() {
  return (
    <div role="status" aria-label="Đang tải giáo trình" className="space-y-4 p-4">
      {[0, 1].map((chapter) => (
        <div key={chapter} className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          {[0, 1, 2].map((lesson) => (
            <Skeleton key={lesson} className="h-9 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LessonSkeleton() {
  return (
    <div role="status" aria-label="Đang tải bài học" className="space-y-6 p-6">
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <Skeleton className="aspect-video w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
