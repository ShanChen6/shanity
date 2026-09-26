"use client";
import { useId, type ReactNode } from "react";
import { Label } from "./label";

type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};
export function FormField({
  id: providedId,
  label,
  description,
  error,
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  error?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const describedBy =
    [description && `${id}-description`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {description && (
        <p id={`${id}-description`} className="text-caption text-muted">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
