"use client";

import { memo, useEffect } from "react";
import { Download } from "lucide-react";
import { API_URL } from "@/lib/api";
import type { LessonRendererProps } from "./types";

export const DocumentLessonRenderer = memo(function DocumentLessonRenderer({
  lesson,
  userAccess,
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

  if (!userAccess.canView)
    return <p role="alert">You do not have access to this document.</p>;
  const fileName = lesson.fileName ?? lesson.metadata?.fileName ?? "Document";
  const viewUrl = `${API_URL}/lessons/${encodeURIComponent(lesson.id)}/document-view`;
  const downloadUrl = `${API_URL}/lessons/${encodeURIComponent(lesson.id)}/document-download`;
  return (
    <section data-testid="document-lesson-renderer" className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">{fileName}</h3>
          <p className="text-xs text-muted">{lesson.fileType ?? lesson.metadata?.fileType ?? "DOCUMENT"}</p>
        </div>
        {allowDownload ? (
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-semibold"
          >
            <Download aria-hidden size={17} />
            Tải tài liệu về máy
          </a>
        ) : null}
      </header>
      <div
        className="min-h-[70vh] overflow-hidden rounded-lg border border-border bg-surface"
        onContextMenu={allowDownload ? undefined : (event) => event.preventDefault()}
      >
        <iframe
          src={viewUrl}
          title={`Document viewer: ${fileName}`}
          className="h-[70vh] w-full"
          sandbox="allow-same-origin"
        />
      </div>
    </section>
  );
});
