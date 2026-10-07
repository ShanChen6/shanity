"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchAdminOrder,
  fetchAdminOrders,
  reconcileOrder,
  refundOrder,
  uploadProof,
} from "./api";
import type {
  AdminOrderDetail,
  ReconcileRequest,
  RefundRequest,
} from "./types";

export const adminOrderKeys = {
  lists: ["admin-orders", "list"] as const,
  list: (query: string) => ["admin-orders", "list", query] as const,
  detail: (id: string) => ["admin-orders", "detail", id] as const,
};

export function useAdminOrders(query: string, enabled: boolean) {
  return useQuery({
    queryKey: adminOrderKeys.list(query),
    queryFn: ({ signal }) => fetchAdminOrders(query, signal),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/**
 * Opening an order is written to the audit trail by the API, so the detail is
 * fetched once per opening: never refetched on focus, reconnect or mount, and
 * dropped from the cache when the drawer closes (reopening is a new view).
 * Mutations hand back the fresh order; see useOrderMutations.
 */
export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: adminOrderKeys.detail(id),
    queryFn: () => fetchAdminOrder(id),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
  });
}

/**
 * Both workflows answer with the updated order: it replaces the cached detail
 * (no refetch, so no extra audit row) and only the list is invalidated.
 */
export function useOrderMutations(orderId: string) {
  const client = useQueryClient();
  const accept = (order: AdminOrderDetail) => {
    client.setQueryData(adminOrderKeys.detail(orderId), order);
    void client.invalidateQueries({ queryKey: adminOrderKeys.lists });
  };
  const reconcile = useMutation({
    mutationFn: (body: ReconcileRequest) => reconcileOrder(orderId, body),
    onSuccess: (result) => accept(result.order),
  });
  const refund = useMutation({
    mutationFn: (body: RefundRequest) => refundOrder(orderId, body),
    onSuccess: (result) => accept(result.order),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadProof(orderId, file),
  });
  return { reconcile, refund, upload };
}
