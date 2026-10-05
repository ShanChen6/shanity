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
  videoProvider?: "LOCAL" | "S3" | "EXTERNAL_EMBED" | "YOUTUBE" | "VIMEO" | null;
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
  userAccess: AccessRights;
  onComplete?: () => void;
};
