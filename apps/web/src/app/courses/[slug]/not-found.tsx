import Link from "next/link";
import { CatalogShell } from "@/features/courses/catalog-view";
import { Icon } from "@/components/ui/icon";

export default function CourseNotFound() {
  return (
    <CatalogShell>
      <main className="flex flex-1 items-center justify-center">
        <section className="container flex max-w-xl flex-col items-center py-16 text-center sm:py-24">
          <span className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-muted">
            <Icon name="book" className="size-7" />
          </span>
          <p className="mt-5 text-caption font-bold uppercase text-primary">
            404 · Khóa học
          </p>
          <h1 className="mt-2 font-heading text-h2 font-semibold">
            Khóa học không tồn tại hoặc chưa được công khai
          </h1>
          <p className="mt-3 text-body-sm text-muted">
            Hãy quay lại danh mục để khám phá những khóa học đang mở.
          </p>
          <Link
            href="/courses"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Icon name="arrowLeft" className="size-4" />
            Về danh mục khóa học
          </Link>
        </section>
      </main>
    </CatalogShell>
  );
}
