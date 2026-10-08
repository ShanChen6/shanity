"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { errorMessage } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";

type Options<TData, TVariables, TCache> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** The cache entry the user is looking at; patched before the server answers. */
  queryKey: QueryKey;
  /** What the entry will look like if the request succeeds. */
  apply: (current: TCache | undefined, variables: TVariables) => TCache;
  /** Extra entries to refetch once the request settles (the entry above always is). */
  invalidate?: readonly QueryKey[];
  /** Toast shown after a rollback; the server's reason is appended. */
  failureMessage: string;
  successMessage?: string;
  onSuccess?: (data: TData, variables: TVariables) => void;
};

/**
 * A mutation whose result the user sees at once: the cache is patched
 * immediately, restored if the request fails (with a toast saying so, instead
 * of the UI silently jumping back), and refetched when it settles so the
 * server's version always wins in the end.
 */
export function useOptimisticMutation<TData, TVariables, TCache>({
  mutationFn,
  queryKey,
  apply,
  invalidate = [],
  failureMessage,
  successMessage,
  onSuccess,
}: Options<TData, TVariables, TCache>) {
  const client = useQueryClient();
  const { success, error } = useToast();
  return useMutation<
    TData,
    unknown,
    TVariables,
    { previous: TCache | undefined }
  >({
    mutationFn,
    onMutate: async (variables) => {
      // An in-flight refetch would overwrite the optimistic value.
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<TCache>(queryKey);
      client.setQueryData<TCache>(queryKey, (current) =>
        apply(current, variables),
      );
      return { previous };
    },
    onError: (reason, _variables, context) => {
      // Nothing was cached before: there is nothing to restore.
      if (context?.previous !== undefined)
        client.setQueryData<TCache>(queryKey, context.previous);
      error(`${failureMessage} ${errorMessage(reason)}`);
    },
    onSuccess: (data, variables) => {
      if (successMessage) success(successMessage);
      onSuccess?.(data, variables);
    },
    onSettled: () =>
      Promise.all(
        [queryKey, ...invalidate].map((key) =>
          client.invalidateQueries({ queryKey: key }),
        ),
      ),
  });
}
