"use client";

import { memo, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { MediaErrorFallback } from "../states/MediaErrorFallback";
import type { LessonRendererProps } from "./types";

export const DocumentLessonRenderer = memo(function DocumentLessonRenderer({
  lesson,
  userAccess,
  onEvidence,
}: LessonRendererProps) {
  const allowDownload = Boolean(
    userAccess.canDownload &&
    (lesson.allowDownload ?? lesson.metadata?.allowDownload),
  );
  useEffect(() => {
    if (allowDownload) return;
    const preventSave = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")
        event.preventDefault();
    };
    window.addEventListener("keydown", preventSave);
    return () => window.removeEventListener("keydown", preventSave);
  }, [allowDownload]);

  const fileName = lesson.fileName ?? lesson.metadata?.fileName ?? "Document";
  const viewUrl = `${API_URL}/lessons/${encodeURIComponent(lesson.id)}/document-view`;
  const downloadUrl = `${API_URL}/lessons/${encodeURIComponent(lesson.id)}/document-download`;
  const document = useQuery({
    queryKey: ["learn", "document-view", lesson.id],
    queryFn: async ({ signal }) => {
      const response = await fetch(viewUrl, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok)
        throw new Error(`Document request failed: ${response.status}`);
      return response.blob();
    },
    enabled: userAccess.canView,
    retry: false,
  });
  const objectUrl = useMemo(
    () =>
      document.data && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(document.data)
        : null,
    [document.data],
  );
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  // The viewer exposes every page once loaded; that is the completion evidence.
  useEffect(() => {
    if (objectUrl) onEvidence?.({ reachedLastPage: true });
  }, [objectUrl, onEvidence]);
  if (!userAccess.canView)
    return <p role="alert">You do not have access to this document.</p>;
  if (document.error)
    return (
      <MediaErrorFallback
        kind="document"
        onRetry={() => void document.refetch()}
      />
    );
  return (
    <section data-testid="document-lesson-renderer" className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">{fileName}</h3>
          <p className="text-xs text-muted">
            {lesson.fileType ?? lesson.metadata?.fileType ?? "DOCUMENT"}
          </p>
        </div>
        {allowDownload ? (
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-semibold"
            onClick={() => onEvidence?.({ downloaded: true })}
          >
            <Download aria-hidden size={17} />
            Tải tài liệu về máy
          </a>
        ) : null}
      </header>
      <div
        className="relative min-h-[70vh] overflow-hidden rounded-lg border border-border bg-surface"
        onContextMenu={
          allowDownload ? undefined : (event) => event.preventDefault()
        }
      >
        <iframe
          src={objectUrl ?? undefined}
          title={`Document viewer: ${fileName}`}
          className="h-[70vh] w-full"
          sandbox="allow-same-origin"
        />
        {document.isPending || !objectUrl ? (
          <div
            role="status"
            aria-label="Đang tải tài liệu"
            className="absolute inset-0 grid place-items-center bg-surface/90"
          >
            <Spinner decorative />
          </div>
        ) : null}
      </div>
    </section>
  );
});
