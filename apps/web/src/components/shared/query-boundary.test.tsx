import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { QueryBoundary } from "./query-boundary";

type Partial<T> = Pick<UseQueryResult<T>, "isPending" | "isError"> &
  Record<string, unknown>;
const asQuery = <T,>(state: Partial<T>) =>
  state as unknown as UseQueryResult<T>;

const pending = asQuery<string[]>({ isPending: true, isError: false });
const failed = (refetch = vi.fn()) =>
  asQuery<string[]>({
    isPending: false,
    isError: true,
    error: new ApiError(500, ["Máy chủ lỗi"]),
    isRefetching: false,
    refetch,
  });
const ok = (data: string[]) =>
  asQuery<string[]>({ isPending: false, isError: false, data });

describe("QueryBoundary", () => {
  it("shows a labelled spinner while pending", () => {
    render(<QueryBoundary query={pending}>{() => <p>data</p>}</QueryBoundary>);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải nội dung");
  });

  it("shows the supplied skeleton instead of the spinner", () => {
    render(
      <QueryBoundary query={pending} loading={<div data-testid="skeleton" />}>
        {() => <p>data</p>}
      </QueryBoundary>,
    );
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces an error with a message and retries on demand", async () => {
    const refetch = vi.fn();
    render(
      <QueryBoundary
        query={failed(refetch)}
        errorTitle="Không tải được khóa học"
      >
        {() => <p>data</p>}
      </QueryBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Không tải được khóa học");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("quotes the correlation id of a server failure, but not of a 4xx", () => {
    const failing = (status: number) =>
      asQuery<string[]>({
        isPending: false,
        isError: true,
        error: new ApiError(status, ["Lỗi"], {}, "req-abc12345"),
        isRefetching: false,
        refetch: vi.fn(),
      });
    const { unmount } = render(
      <QueryBoundary query={failing(500)}>{() => <p>data</p>}</QueryBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mã tham chiếu: req-abc12345",
    );
    unmount();
    render(
      <QueryBoundary query={failing(404)}>{() => <p>data</p>}</QueryBoundary>,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Mã tham chiếu");
  });

  it("shows the empty state only when the data is empty", () => {
    const empty = { title: "Chưa có gì", description: "Hãy tạo mục đầu tiên" };
    const { rerender } = render(
      <QueryBoundary
        query={ok([])}
        empty={empty}
        isEmpty={(rows) => !rows.length}
      >
        {(rows) => <p>{rows.length} mục</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText("Chưa có gì")).toBeInTheDocument();
    rerender(
      <QueryBoundary
        query={ok(["a"])}
        empty={empty}
        isEmpty={(rows) => !rows.length}
      >
        {(rows) => <p>{rows.length} mục</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText("1 mục")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có gì")).toBeNull();
  });

  it("renders children with the data on success", () => {
    render(
      <QueryBoundary query={ok(["x", "y"])}>
        {(rows) => <p>{rows.join(",")}</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText("x,y")).toBeInTheDocument();
  });
});
