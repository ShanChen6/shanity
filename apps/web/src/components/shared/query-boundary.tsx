"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

type EmptyProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
};

/**
 * One state machine for data screens, so every page loads, fails, empties and
 * succeeds the same way:
 *
 *   pending -> `loading` (pass a skeleton shaped like the content to avoid
 *              layout shift; defaults to a labelled spinner)
 *   error   -> ErrorState with the API's message and a retry button
 *   empty   -> EmptyState, when `isEmpty` says so
 *   success -> `children(data)`
 *
 * Do not use with a disabled query: it stays "pending" and would show the
 * loading state forever.
 */
export function QueryBoundary<T>({
  query,
  children,
  loading,
  empty,
  isEmpty,
  errorTitle = "Không thể tải dữ liệu",
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  empty?: EmptyProps;
  isEmpty?: (data: T) => boolean;
  errorTitle?: string;
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>;
  if (query.isError)
    return (
      <ErrorState
        title={errorTitle}
        description={errorMessage(query.error)}
        action={
          <Button
            variant="outline"
            loading={query.isRefetching}
            onClick={() => void query.refetch()}
          >
            Thử lại
          </Button>
        }
      />
    );
  if (empty && isEmpty?.(query.data)) return <EmptyState {...empty} />;
  return <>{children(query.data)}</>;
}
