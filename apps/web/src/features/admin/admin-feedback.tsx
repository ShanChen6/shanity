"use client";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";

const Feedback = createContext<(message: string) => void>(() => {});

export function AdminFeedback({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  return (
    <Feedback.Provider
      value={(message) => setToast({ id: ++sequence.current, message })}
    >
      {children}
      {toast && (
        <section
          aria-label="Thông báo quản trị"
          className="fixed inset-x-4 bottom-4 z-50 flex items-start gap-3 rounded-lg border border-border-strong bg-surface p-4 shadow-lg sm:left-auto sm:w-96"
        >
          <p
            key={toast.id}
            role="status"
            aria-atomic="true"
            className="min-w-0 flex-1 break-words text-sm"
          >
            {toast.message}
          </p>
          <Button
            variant="ghost"
            className="min-h-11"
            aria-label="Đóng thông báo"
            onClick={() => {
              document
                .getElementById("admin-content")
                ?.focus({ preventScroll: true });
              setToast(null);
            }}
          >
            Đóng
          </Button>
        </section>
      )}
    </Feedback.Provider>
  );
}
export function useAdminFeedback() {
  return useContext(Feedback);
}
