"use client";
import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { issueLocation, issueText, type ImportFailure } from "./api";

/** The failure summary, then every located issue so the file can be fixed in one pass. */
export function ImportIssueList({ failure }: { failure: ImportFailure }) {
  const { message, issues, totalIssues } = failure;
  const root = useRef<HTMLDivElement>(null);
  // The list sits at the end of a long dialog: bring it into view on failure.
  useEffect(() => {
    root.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [failure]);
  return (
    <div ref={root}>
      <Alert tone="danger" title="Import không thành công">
        <p>{message}</p>
        {issues.length ? (
          <ul
            aria-label="Danh sách lỗi trong file"
            className="mt-2 grid max-h-56 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5 overflow-y-auto pr-1"
          >
            {issues.map((issue, index) => {
              const location = issueLocation(issue);
              return (
                <li key={index} className="col-span-2 grid grid-cols-subgrid">
                  <span className="justify-self-start whitespace-nowrap rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {location || "File"}
                  </span>
                  <span className="break-words">{issueText(issue)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {totalIssues > issues.length ? (
          <p className="mt-2 text-xs">
            Đang hiển thị {issues.length}/{totalIssues} lỗi đầu tiên.
          </p>
        ) : null}
      </Alert>
    </div>
  );
}
