"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAGE_SIZES } from "./filters";

export function OrdersPagination({
  page,
  limit,
  total,
  totalPages,
  shown,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Rows on this page. */
  shown: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const first = (page - 1) * limit + 1;
  const last = first + shown - 1;
  return (
    <nav
      aria-label="Phân trang đơn hàng"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p aria-live="polite" className="text-muted">
        Hiển thị {first}–{last} trong {total} đơn hàng.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Số dòng mỗi trang</span>
          <Select
            className="w-20"
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Trang trước
        </Button>
        <span aria-current="page">
          Trang {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Trang sau
        </Button>
      </div>
    </nav>
  );
}
