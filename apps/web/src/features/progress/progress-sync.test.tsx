import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ProgressSync, broadcastProgressChanged } from "./progress-sync";
import { courseProgressKey, progressPercentage } from "./use-course-progress";

describe("progressPercentage (mirror of the server formula)", () => {
  it.each([
    [8, 10, 80],
    [8, 12, 66],
    [7, 9, 77],
    [199, 200, 99],
    [10, 10, 100],
    [0, 0, 100],
  ])("%i/%i -> %i%%", (done, total, expected) => {
    expect(progressPercentage(done, total)).toBe(expected);
  });
});

describe("cross-tab progress sync", () => {
  it("refreshes this tab's course progress when another tab reports a change", async () => {
    const client = new QueryClient();
    const key = courseProgressKey("course-1", "user-1");
    const other = courseProgressKey("course-2", "user-1");
    client.setQueryData(key, { percentage: 70 });
    client.setQueryData(other, { percentage: 10 });
    render(
      <QueryClientProvider client={client}>
        <ProgressSync />
      </QueryClientProvider>,
    );
    // Simulates the other tab (BroadcastChannel skips the sending object).
    broadcastProgressChanged("course-1");
    await waitFor(() =>
      expect(client.getQueryState(key)?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
