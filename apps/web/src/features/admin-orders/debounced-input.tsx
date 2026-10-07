"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange"
> & {
  /** The committed value (from the URL). */
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
  /** Cleans what is typed, e.g. digits only. */
  sanitize?: (value: string) => string;
};

/**
 * Types freely, commits after `delay` ms of silence. When the committed value
 * changes from elsewhere (Xóa bộ lọc, browser back) the text follows it,
 * except for the echo of this input's own commit.
 */
export function DebouncedInput({
  value,
  onCommit,
  delay = 300,
  sanitize = (text) => text,
  ...props
}: Props) {
  const [text, setText] = useState(value);
  const [emitted, setEmitted] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  if (value !== seen) {
    setSeen(value);
    if (value !== emitted) {
      setText(value);
      setEmitted(value);
    }
  }
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => {
        const next = sanitize(event.target.value);
        setText(next);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          const committed = next.trim();
          setEmitted(committed);
          onCommit(committed);
        }, delay);
      }}
    />
  );
}
