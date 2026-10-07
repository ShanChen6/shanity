import { prettyJson } from "./format";

/** Escaped JSON as a text node (never injected as HTML). */
export function JsonPre({ value, label }: { value: unknown; label?: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-h-72 overflow-auto rounded-md bg-surface-secondary/60 p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]"
    >
      {prettyJson(value)}
    </pre>
  );
}

export function JsonBlock({
  value,
  summary,
}: {
  value: unknown;
  summary: string;
}) {
  return (
    <details className="mt-2">
      <summary className="min-h-9 cursor-pointer select-none py-2 text-xs font-semibold text-primary">
        {summary}
      </summary>
      <JsonPre value={value} label={summary} />
    </details>
  );
}
