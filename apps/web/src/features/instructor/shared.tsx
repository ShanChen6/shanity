"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coursePath, message, type Course } from "./data";
export function StatusBadge({ status }: { status: Course["status"] }) {
  return (
    <span className={cn("instructor-badge", `status-${status.toLowerCase()}`)}>
      {status.toUpperCase()}
    </span>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="instructor-error">
      <p>{message(error)}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return children ? (
    <div className="instructor-toast" role="status">
      {children}
    </div>
  ) : null;
}
export function EditNav({
  id,
  active,
}: {
  id: string;
  active: "basic" | "curriculum" | "preview" | "progress" | "quizzes";
}) {
  return (
    <nav className="instructor-tabs" aria-label="Course editor">
      {(
        [
          ["basic", "Thông tin cơ bản"],
          ["curriculum", "Đề cương"],
          ["quizzes", "Bài kiểm tra"],
          ["preview", "Xem trước & xuất bản"],
          ["progress", "Tiến độ học viên"],
        ] as const
      ).map(([tab, label]) => (
        <Link
          key={tab}
          aria-current={active === tab ? "page" : undefined}
          href={`${coursePath(id)}/${tab === "basic" || tab === "curriculum" ? `edit/${tab}` : tab}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function Confirm({
  title,
  children,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="instructor-dialog"
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div>{children}</div>
      <div className="instructor-actions">
        <Button autoFocus disabled={busy} variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button loading={busy} onClick={onConfirm}>
          Xác nhận
        </Button>
      </div>
    </dialog>
  );
}
