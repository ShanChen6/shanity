"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { STATUS_META } from "@/features/payments/order-model";
import { cn } from "@/lib/utils";
import { DebouncedInput } from "./debounced-input";
import {
  hasActiveFilters,
  type DateField,
  type FilterProblems,
  type OrderFilters,
} from "./filters";
import { LIST_PROVIDERS, LIST_STATUSES, PROVIDER_LABELS } from "./order-model";
import type { LedgerProvider, OrderStatus } from "./types";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 15);

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block min-w-0 space-y-1 text-sm", className)}>
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function OrdersFilters({
  filters,
  problems,
  onChange,
  onClear,
}: {
  filters: OrderFilters;
  problems: FilterProblems;
  onChange: (patch: Partial<OrderFilters>) => void;
  onClear: () => void;
}) {
  return (
    <form
      role="search"
      aria-label="Tìm kiếm và lọc đơn hàng"
      onSubmit={(event) => event.preventDefault()}
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <Field label="Tìm kiếm">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <DebouncedInput
            type="search"
            name="q"
            maxLength={100}
            autoComplete="off"
            placeholder="Mã đơn, email hoặc tên học viên, khóa học, mã giao dịch"
            className="pl-10"
            value={filters.q}
            onCommit={(q) => onChange({ q })}
          />
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Trạng thái">
          <Select
            name="status"
            value={filters.status}
            onChange={(event) =>
              onChange({ status: event.target.value as OrderStatus | "" })
            }
          >
            <option value="">Tất cả</option>
            {LIST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nhà cung cấp">
          <Select
            name="provider"
            value={filters.provider}
            onChange={(event) =>
              onChange({ provider: event.target.value as LedgerProvider | "" })
            }
          >
            <option value="">Tất cả</option>
            {LIST_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {PROVIDER_LABELS[provider]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lọc theo ngày">
          <Select
            name="dateField"
            value={filters.dateField}
            onChange={(event) =>
              onChange({ dateField: event.target.value as DateField })
            }
          >
            <option value="createdAt">Ngày tạo</option>
            <option value="completedAt">Ngày hoàn tất</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Từ ngày">
            <Input
              type="date"
              name="dateFrom"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              aria-invalid={problems.dates ? true : undefined}
              onChange={(event) => onChange({ dateFrom: event.target.value })}
            />
          </Field>
          <Field label="Đến ngày">
            <Input
              type="date"
              name="dateTo"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              aria-invalid={problems.dates ? true : undefined}
              onChange={(event) => onChange({ dateTo: event.target.value })}
            />
          </Field>
        </div>
      </div>
      {problems.dates && (
        <p role="alert" className="text-caption font-medium text-danger">
          {problems.dates}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Tổng tiền từ (₫)" className="w-44">
          <DebouncedInput
            name="amountMin"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            aria-invalid={problems.amounts ? true : undefined}
            sanitize={digitsOnly}
            value={filters.amountMin}
            onCommit={(amountMin) => onChange({ amountMin })}
          />
        </Field>
        <Field label="Tổng tiền đến (₫)" className="w-44">
          <DebouncedInput
            name="amountMax"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Không giới hạn"
            aria-invalid={problems.amounts ? true : undefined}
            sanitize={digitsOnly}
            value={filters.amountMax}
            onCommit={(amountMax) => onChange({ amountMax })}
          />
        </Field>
        <Button
          variant="outline"
          onClick={onClear}
          disabled={!hasActiveFilters(filters)}
        >
          Xóa bộ lọc
        </Button>
      </div>
      {problems.amounts && (
        <p role="alert" className="text-caption font-medium text-danger">
          {problems.amounts}
        </p>
      )}
    </form>
  );
}
