import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/providers/toast-provider";
import { useOptimisticMutation } from "./useOptimisticMutation";

const KEY = ["todos"];
type Todos = string[];

function setup(server: { todos: Todos }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
      {/* Keeps the entry observed, as a mounted screen would. */}
      <Observer />
    </QueryClientProvider>
  );
  function Observer() {
    useQuery({ queryKey: KEY, queryFn: async () => [...server.todos] });
    return null;
  }
  return { client, wrapper };
}

const options = <T = unknown,>(
  mutationFn: (todo: string) => Promise<T>,
  extra: Record<string, unknown> = {},
) => ({
  queryKey: KEY,
  mutationFn,
  apply: (current: Todos | undefined, todo: string) => [
    ...(current ?? []),
    todo,
  ],
  failureMessage: "Không thêm được.",
  ...extra,
});

describe("useOptimisticMutation", () => {
  it("shows the result before the server answers, then lets the server win", async () => {
    const server = { todos: ["a"] };
    const { client, wrapper } = setup(server);
    let finish!: () => void;
    const { result } = renderHook(
      () =>
        useOptimisticMutation<unknown, string, Todos>(
          options(
            (todo) =>
              new Promise((resolve) => {
                finish = () => {
                  server.todos.push(todo, "added-by-someone-else");
                  resolve(null);
                };
              }),
          ),
        ),
      { wrapper },
    );
    await waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a"]));

    act(() => result.current.mutate("b"));
    await waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a", "b"]));
    expect(result.current.isPending).toBe(true);

    finish();
    await waitFor(() =>
      expect(client.getQueryData(KEY)).toEqual([
        "a",
        "b",
        "added-by-someone-else",
      ]),
    );
  });

  it("restores the previous data and says so when the request fails", async () => {
    const server = { todos: ["a"] };
    const { client, wrapper } = setup(server);
    const { result } = renderHook(
      () =>
        useOptimisticMutation<unknown, string, Todos>(
          options(async () => {
            throw new ApiError(500, ["Máy chủ lỗi"]);
          }),
        ),
      { wrapper: ({ children }) => <>{wrapper({ children })}</> },
    );
    await waitFor(() => expect(client.getQueryData(KEY)).toEqual(["a"]));
    render(<></>); // keep RTL's document alive for the toast region below

    act(() => result.current.mutate("b"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(KEY)).toEqual(["a"]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không thêm được.");
  });

  it("stays quiet on success unless asked, then confirms", async () => {
    const server = { todos: [] as Todos };
    const { wrapper } = setup(server);
    const quiet = renderHook(
      () =>
        useOptimisticMutation<unknown, string, Todos>(
          options(async () => null),
        ),
      { wrapper },
    );
    await act(async () => quiet.result.current.mutate("x"));
    await waitFor(() => expect(quiet.result.current.isSuccess).toBe(true));
    expect(screen.queryByRole("status")).toBeNull();

    const loud = renderHook(
      () =>
        useOptimisticMutation<unknown, string, Todos>(
          options(async () => null, { successMessage: "Đã thêm." }),
        ),
      { wrapper },
    );
    await act(async () => loud.result.current.mutate("y"));
    expect(await screen.findByRole("status")).toHaveTextContent("Đã thêm.");
  });

  it("calls onSuccess with the server's answer", async () => {
    const { wrapper } = setup({ todos: [] });
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useOptimisticMutation<{ id: number }, string, Todos>(
          options(async () => ({ id: 7 }), { onSuccess }),
        ),
      { wrapper },
    );
    await act(async () => result.current.mutate("z"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 7 }, "z"));
  });

  it("does not invent a rollback when nothing was cached", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useOptimisticMutation<unknown, string, Todos>(
          options(async () => {
            throw new Error("boom");
          }),
        ),
      { wrapper },
    );
    act(() => result.current.mutate("q"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
