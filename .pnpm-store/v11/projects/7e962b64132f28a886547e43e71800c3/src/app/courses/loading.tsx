import { CatalogShell } from "@/features/courses/catalog-view";
import { CatalogSkeleton } from "@/features/courses/catalog-loading";

export default function CoursesLoading() {
  return (
    <CatalogShell>
      <main className="flex-1">
        <section className="border-b border-border bg-surface-secondary">
          <div className="container py-9 sm:py-12">
            <div className="h-3 w-40 animate-pulse rounded bg-border" />
            <div className="mt-4 h-10 w-72 max-w-full animate-pulse rounded bg-border" />
            <div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded bg-border" />
          </div>
        </section>
        <section className="container py-7 sm:py-9">
          <div className="mb-7 h-16 animate-pulse rounded-md bg-surface-secondary" />
          <CatalogSkeleton />
        </section>
      </main>
    </CatalogShell>
  );
}
