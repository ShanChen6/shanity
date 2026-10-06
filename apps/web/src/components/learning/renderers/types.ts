export type CompletionEvidence = {
  scrollPercentage?: number;
  reachedLastPage?: boolean;
  downloaded?: boolean;
};

export type LessonType = "TEXT" | "VIDEO" | "DOCUMENT";

export type EditorBlock = {
  id?: string;
  type: "header" | "paragraph" | "list" | "code" | "quote" | "image";
  data: Record<string, unknown>;
};

export type EditorContent = { blocks: EditorBlock[] };

export type LessonData = {
  id: string;
  title: string;
  type: LessonType;
  content?: string | EditorContent | null;
  videoProvider?:
    "LOCAL" | "S3" | "EXTERNAL_EMBED" | "YOUTUBE" | "VIMEO" | null;
  videoExternalUrl?: string | null;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  fileName?: string | null;
  fileSize?: string | number | null;
  fileType?: "PDF" | "SLIDE" | "DOCX" | "OTHER" | null;
  mimeType?: string | null;
  allowDownload?: boolean | null;
  metadata?: {
    provider?: LessonData["videoProvider"];
    externalUrl?: string | null;
    fileName?: string | null;
    fileType?: LessonData["fileType"];
    allowDownload?: boolean;
  };
};

export type AccessRights = {
  canView: boolean;
  canDownload: boolean;
};

export type LessonRendererProps = {
  lesson: LessonData;
  initialPosition?: number;
  userAccess: AccessRights;
  // Reports proof the learner consumed the lesson; the action bar sends it
  // with POST /lessons/:id/progress/complete. Text: >= 80% read. Document:
  // viewer loaded (or downloaded).
  onEvidence?: (evidence: CompletionEvidence) => void;
  // Videos complete on the server through onVideoProgress; this fires once at
  // the same threshold so the page can react.
  onComplete?: () => void;
  onVideoProgress?: (progress: {
    seconds: number;
    percentage: number;
    ended?: boolean;
  }) => void;
};
