"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProgressSync } from "@/features/progress/progress-sync";

// One client per browser tab so mutations on one page (e.g. completing a
// lesson) invalidate summaries cached by another (e.g. /my-learning).
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Cross-device freshness: re-read progress when the user returns to
          // a tab/device (server responses are no-store, so this is current).
          queries: { refetchOnWindowFocus: true, refetchOnReconnect: true },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ProgressSync />
      {children}
    </QueryClientProvider>
  );
}
