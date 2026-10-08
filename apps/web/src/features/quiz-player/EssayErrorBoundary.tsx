"use client";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; label?: string };
type State = { failed: boolean; attempt: number };

/**
 * Catches a crash inside the essay editor without taking the exam down.
 * Nothing typed is lost: the editor mirrors unsynced text to localStorage, and
 * [Retry] remounts it, which restores that draft.
 */
export class EssayErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-danger/40 bg-danger-background p-4 text-sm text-danger-foreground"
        >
          <p className="font-semibold">
            {this.props.label ?? "Không hiển thị được ô trả lời."}
          </p>
          <p>
            Bài làm bạn đã nhập vẫn được giữ trên thiết bị này. Bấm Retry để
            tải lại.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              this.setState((state) => ({
                failed: false,
                attempt: state.attempt + 1,
              }))
            }
          >
            Retry
          </Button>
        </div>
      );
    // A new key remounts the children with a clean React state.
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
