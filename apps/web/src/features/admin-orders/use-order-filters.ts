"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  parseOrderFilters,
  serializeOrderFilters,
  type OrderFilters,
} from "./filters";

/** Filters live in the URL (shareable, survives reload); edits replace it. */
export function useOrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const filters = useMemo(
    () => parseOrderFilters(new URLSearchParams(search)),
    [search],
  );
  // Edits made before the router commits the previous one still stack up.
  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  }, [filters]);

  const update = useCallback(
    (patch: Partial<OrderFilters>) => {
      // Any change but paging itself goes back to the first page.
      const next = { ...latest.current, page: 1, ...patch };
      latest.current = next;
      const query = serializeOrderFilters(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  const clear = useCallback(
    () =>
      update({
        q: "",
        status: "",
        provider: "",
        dateField: "createdAt",
        dateFrom: "",
        dateTo: "",
        amountMin: "",
        amountMax: "",
      }),
    [update],
  );

  return { filters, update, clear };
}
