import { SiteShell } from "@/components/layout/site-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CourseDetailLoading() {
  return (
    <SiteShell>
      <main className="flex-1">
        <section className="border-b border-border bg-surface-secondary">
          <div className="container py-9 sm:py-12">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-5 h-10 w-full max-w-2xl" />
            <Skeleton className="mt-3 h-5 w-full max-w-3xl" />
            <Skeleton className="mt-6 h-11 w-64 max-w-full" />
          </div>
        </section>
        <section className="container grid grid-cols-1 gap-8 py-7 sm:py-9 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="order-2 space-y-8 lg:order-1">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
          <div className="order-1 lg:order-2">
            <Skeleton className="aspect-[16/10] w-full" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
