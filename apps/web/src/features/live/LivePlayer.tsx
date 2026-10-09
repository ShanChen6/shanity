import { normalizeEmbedUrl, type EmbedProvider } from "./embedUrlNormalizer";

const hostList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
// Literal access: Next inlines NEXT_PUBLIC_* only when written out.
const JITSI_HOSTS = hostList(process.env.NEXT_PUBLIC_LIVE_JITSI_HOSTS);
const CUSTOM_HOSTS = hostList(process.env.NEXT_PUBLIC_LIVE_EMBED_ALLOWED_HOSTS);

/** What each provider's player may use; meetings need camera and mic. */
const ALLOW: Record<EmbedProvider, string> = {
  YOUTUBE: "autoplay; encrypted-media; picture-in-picture; fullscreen",
  VIMEO: "autoplay; fullscreen; picture-in-picture",
  JITSI: "camera; microphone; display-capture; autoplay; fullscreen",
  CUSTOM_EMBED: "autoplay; fullscreen",
};

/**
 * A 16:9 frame for the session's stream. The URL is normalized again here,
 * so only the providers the normalizer knows ever get framed, whatever the
 * server sent; operator-approved custom hosts also run sandboxed.
 */
export function LivePlayer({
  url,
  provider,
  title,
  jitsiHosts = JITSI_HOSTS,
  customHosts = CUSTOM_HOSTS,
}: {
  url: string;
  provider: EmbedProvider;
  title: string;
  jitsiHosts?: string[];
  customHosts?: string[];
}) {
  const embed = normalizeEmbedUrl(url, { jitsiHosts, customHosts });
  if (!embed || embed.provider !== provider)
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-black p-6 text-center text-sm text-white/80" role="alert">
        Không phát được buổi học này: liên kết phát sóng không hợp lệ.
      </div>
    );
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black shadow-lg">
      <iframe
        src={embed.embedUrl}
        title={`Phát trực tiếp: ${title}`}
        allow={ALLOW[embed.provider]}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
        className="absolute inset-0 size-full border-0"
        data-testid="live-player"
        {...(embed.provider === "CUSTOM_EMBED"
          ? { sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups" }
          : {})}
      />
    </div>
  );
}
