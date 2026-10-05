"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_URL, api } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { MediaErrorFallback } from "../states/MediaErrorFallback";
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
  const [buffering, setBuffering] = useState(managed);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
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
    return <MediaErrorFallback kind="video" onRetry={() => void access.refetch()} />;
  const source = managed ? mediaUrl(access.data!.url) : externalUrl;
  if (!source)
    return <MediaErrorFallback kind="video" />;
  if (mediaFailed)
    return (
      <MediaErrorFallback
        kind="video"
        onRetry={() => {
          setMediaFailed(false);
          setBuffering(true);
          setRetryVersion((value) => value + 1);
        }}
      />
    );
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        key={retryVersion}
        data-testid="video-lesson-renderer"
        className="h-full w-full object-contain"
        src={source}
        poster={lesson.posterUrl ?? undefined}
        controls
        controlsList="nodownload"
        preload="metadata"
        onLoadStart={() => setBuffering(true)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onError={() => setMediaFailed(true)}
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
      {buffering ? (
        <div role="status" aria-label="Video đang tải" className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 text-white">
          <Spinner />
        </div>
      ) : null}
    </div>
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
