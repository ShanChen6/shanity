"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { catalogHref } from "./catalog-types";
import type { CatalogFilters } from "./catalog-types";

export function CatalogControls({ filters }: { filters: CatalogFilters }) {
  const router = useRouter();
  const [term, setTerm] = useState(filters.search);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const search = term.trim().slice(0, 100);
    if (search === filters.search) return;
    const timeout = window.setTimeout(() => {
      startTransition(() =>
        router.replace(catalogHref({ ...filters, search, page: 1 }, 1), {
          scroll: false,
        }),
      );
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [filters, router, term]);

  function changeSort(value: string) {
    startTransition(() =>
      router.replace(
        catalogHref(
          {
            ...filters,
            page: 1,
            sortBy: "publishedAt",
            sortOrder: value === "oldest" ? "ASC" : "DESC",
          },
          1,
        ),
        { scroll: false },
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <label
          htmlFor="course-search"
          className="mb-2 block text-body-sm font-semibold text-foreground"
        >
          Tìm khóa học
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            id="course-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Tên khóa học hoặc chủ đề"
            autoComplete="off"
            className="pl-11 pr-11"
            aria-describedby="course-search-status"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              aria-label="Xóa nội dung tìm kiếm"
            >
              <Icon name="close" className="size-4" />
            </button>
          )}
        </div>
        <p id="course-search-status" className="sr-only" aria-live="polite">
          {isPending ? "Đang cập nhật danh sách khóa học" : ""}
        </p>
      </div>

      <div className="w-full sm:w-52 sm:shrink-0">
        <label
          htmlFor="course-sort"
          className="mb-2 block text-body-sm font-semibold text-foreground"
        >
          Sắp xếp
        </label>
        <Select
          id="course-sort"
          value={filters.sortOrder === "ASC" ? "oldest" : "newest"}
          onChange={(event) => changeSort(event.target.value)}
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </Select>
      </div>
    </div>
  );
}
