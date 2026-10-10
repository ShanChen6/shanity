import type { Metadata } from "next";
import { errorMessage } from "@/lib/api";
import { CatalogError } from "@/features/courses/catalog-error";
import { SiteShell } from "@/components/layout/site-shell";
import { CourseCatalog } from "@/features/courses/catalog-view";
import { fetchCatalog } from "@/features/courses/server";
import type {
  CatalogFilters,
  CourseCatalogResponse,
} from "@/features/courses/catalog-types";

export const metadata: Metadata = {
  title: "Khóa học | Shanity",
  description: "Khám phá các khóa học công khai trên Shanity.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function parseFilters(searchParams: SearchParams): CatalogFilters {
  const rawLimit = Number(first(searchParams.limit));
  const instructorId = first(searchParams.instructorId);
  return {
    page: parsePage(first(searchParams.page)),
    limit:
      Number.isSafeInteger(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 50)
        : 10,
    search: (first(searchParams.search) ?? "").trim().slice(0, 100),
    sortBy:
      first(searchParams.sortBy) === "createdAt" ? "createdAt" : "publishedAt",
    sortOrder: first(searchParams.sortOrder) === "ASC" ? "ASC" : "DESC",
    instructorId:
      instructorId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        instructorId,
      )
        ? instructorId
        : undefined,
  };
}

export default async function CoursesPage({
  searchParams,
}: PageProps<"/courses">) {
  const filters = parseFilters(await searchParams);
  let catalog: CourseCatalogResponse | undefined;
  let failure: string | undefined;
  try {
    catalog = await fetchCatalog(filters);
  } catch (error) {
    failure = errorMessage(error);
  }

  if (failure)
    return (
      <SiteShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="container py-10">
            <CatalogError message={failure} />
          </div>
        </main>
      </SiteShell>
    );

  return <CourseCatalog catalog={catalog!} filters={filters} />;
}
