export type CatalogFilters = {
  page: number;
  limit: number;
  search: string;
  sortBy: 'publishedAt' | 'createdAt';
  sortOrder: 'ASC' | 'DESC';
  instructorId?: string;
};

export type CatalogCourse = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnail: string | null;
  publishedAt: string | null;
  instructor: {
    id: string;
    displayName: string;
    avatar: string | null;
  } | null;
};

export type CourseCatalogResponse = {
  data: CatalogCourse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function catalogHref(filters: CatalogFilters, page = filters.page) {
  const params = new URLSearchParams({
    page: String(page),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.instructorId) params.set('instructorId', filters.instructorId);
  return `/courses?${params.toString()}`;
}