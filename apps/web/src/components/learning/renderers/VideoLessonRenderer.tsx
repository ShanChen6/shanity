"use client";

import { memo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_URL, api } from "@/lib/api";
import type { LessonRendererProps } from "./types";

type VideoAccess = { url: string; expiresInSeconds: number | null };

export const VideoLessonRenderer = memo(function VideoLessonRenderer({
  lesson,
  userAccess,
  onComplete,
}: LessonRendererProps) {
  const provider = lesson.videoProvider ?? lesson.metadata?.provider;
  const externalUrl = lesson.videoExternalUrl ?? lesson.metadata?.externalUrl;
  const managed = provider === "LOCAL" || provider === "S3";
  const access = useQuery({
    queryKey: ["learn", "video-access", lesson.id],
    queryFn: ({ signal }) =>
      api<VideoAccess>(`/lessons/${lesson.id}/video-access`, { signal }),
    enabled: userAccess.canView && managed,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });
  const completed = useRef(false);
  const reportProgress = useCallback(
    (element: HTMLVideoElement) => {
      if (
        !completed.current &&
        element.duration > 0 &&
        element.currentTime / element.duration >= 0.9
      ) {
        completed.current = true;
        onComplete?.();
      }
    },
    [onComplete],
  );

  if (!userAccess.canView)
    return <p role="alert">You do not have access to this video.</p>;
  const youtube = youtubeEmbed(externalUrl);
  if (provider === "YOUTUBE" && youtube)
    return (
      <div className="aspect-video overflow-hidden rounded-lg bg-black" data-testid="video-lesson-renderer">
        <iframe
          className="h-full w-full"
          src={youtube}
          title={lesson.title}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  if (managed && access.isPending)
    return <p role="status" className="p-6 text-sm text-muted">Đang chuẩn bị video…</p>;
  if (managed && (access.error || !access.data?.url))
    return <p role="alert" className="p-6 text-danger">Không thể tải video.</p>;
  const source = managed ? mediaUrl(access.data!.url) : externalUrl;
  if (!source)
    return <p role="alert" className="p-6 text-danger">Video chưa sẵn sàng.</p>;
  return (
    <video
      data-testid="video-lesson-renderer"
      className="aspect-video w-full rounded-lg bg-black"
      src={source}
      controls
      controlsList="nodownload"
      preload="metadata"
      onTimeUpdate={(event) => reportProgress(event.currentTarget)}
      onEnded={() => {
        if (!completed.current) {
          completed.current = true;
          onComplete?.();
        }
      }}
    >
      Trình duyệt không hỗ trợ phát video.
    </video>
  );
});

function mediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function youtubeEmbed(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
  } catch {
    return null;
  }
}
