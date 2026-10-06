import type { ComponentPropsWithRef } from "react";

// shadcn/ui-style table primitives. The wrapper scrolls horizontally so wide
// tables never push the page sideways on phones.
export function Table({
  className = "",
  ...props
}: ComponentPropsWithRef<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
      <table
        {...props}
        className={`w-full caption-bottom border-collapse text-sm ${className}`}
      />
    </div>
  );
}
export function TableHeader({
  className = "",
  ...props
}: ComponentPropsWithRef<"thead">) {
  return (
    <thead
      {...props}
      className={`bg-surface-secondary/60 [&_tr]:border-b ${className}`}
    />
  );
}
export function TableBody({
  className = "",
  ...props
}: ComponentPropsWithRef<"tbody">) {
  return (
    <tbody {...props} className={`[&_tr:last-child]:border-0 ${className}`} />
  );
}
export function TableRow({
  className = "",
  ...props
}: ComponentPropsWithRef<"tr">) {
  return (
    <tr
      {...props}
      className={`border-b border-border transition-colors ${className}`}
    />
  );
}
export function TableHead({
  className = "",
  ...props
}: ComponentPropsWithRef<"th">) {
  return (
    <th
      {...props}
      className={`h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    />
  );
}
export function TableCell({
  className = "",
  ...props
}: ComponentPropsWithRef<"td">) {
  return <td {...props} className={`px-4 py-3 align-middle ${className}`} />;
}
