/**
 * Turns the link an instructor pastes (a YouTube watch page, a youtu.be
 * share link, a Vimeo page, a Jitsi room...) into the URL an <iframe> can
 * play. Anything it does not recognise is refused (null): a live class page
 * must never frame an arbitrary site.
 *
 * Kept identical in apps/web/src/features/live/embedUrlNormalizer.ts (the API stores
 * the normalized form; the web normalizes again before rendering).
 */

export type EmbedProvider = 'YOUTUBE' | 'VIMEO' | 'JITSI' | 'CUSTOM_EMBED';

export type NormalizedEmbed = { provider: EmbedProvider; embedUrl: string };

export type EmbedOptions = {
  /** Self-hosted Jitsi servers, besides meet.jit.si. */
  jitsiHosts?: readonly string[];
  /** Hosts allowed as CUSTOM_EMBED (https only). Empty: none. */
  customHosts?: readonly string[];
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = [
  'youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'music.youtube.com',
];
const JITSI_ROOM = /^[A-Za-z0-9_-]{1,100}$/;

function parse(input: string): URL | null {
  const text = input.trim();
  if (!text || text.length > 2048) return null;
  try {
    // Pasted without a scheme ("youtu.be/abc"): assume https.
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`,
    );
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const bareHost = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');
const segments = (url: URL) => url.pathname.split('/').filter(Boolean);

function youtube(url: URL): string | null {
  const host = bareHost(url);
  let id: string | null = null;
  if (host === 'youtu.be') id = segments(url)[0] ?? null;
  else if (YOUTUBE_HOSTS.includes(host)) {
    const [first, second] = segments(url);
    if (first === 'watch') id = url.searchParams.get('v');
    else if (['live', 'embed', 'shorts', 'v'].includes(first ?? ''))
      id = second ?? null;
  } else return null;
  return id && YOUTUBE_ID.test(id)
    ? `https://www.youtube.com/embed/${id}?autoplay=1`
    : null;
}

function vimeo(url: URL): string | null {
  const host = bareHost(url);
  const parts = segments(url);
  if (host === 'player.vimeo.com') {
    const [kind, id] = parts;
    if (kind !== 'video' || !/^\d+$/.test(id ?? '')) return null;
    const hash = url.searchParams.get('h');
    return `https://player.vimeo.com/video/${id}?autoplay=1${
      hash && /^[0-9a-f]+$/i.test(hash) ? `&h=${hash}` : ''
    }`;
  }
  if (host !== 'vimeo.com') return null;
  // Live events: vimeo.com/event/123 (and its /embed form).
  if (parts[0] === 'event' && /^\d+$/.test(parts[1] ?? ''))
    return `https://vimeo.com/event/${parts[1]}/embed?autoplay=1`;
  // vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/x/123
  const index = parts.findIndex((part) => /^\d+$/.test(part));
  if (index === -1) return null;
  const id = parts[index];
  const hash = parts[index + 1];
  return `https://player.vimeo.com/video/${id}?autoplay=1${
    hash && /^[0-9a-f]+$/i.test(hash) ? `&h=${hash}` : ''
  }`;
}

function jitsi(url: URL, hosts: readonly string[]): string | null {
  const host = url.hostname.toLowerCase();
  if (!hosts.includes(host)) return null;
  const parts = segments(url);
  if (parts.length !== 1 || !JITSI_ROOM.test(parts[0]!)) return null;
  return `https://${host}/${parts[0]}`;
}

function custom(url: URL, hosts: readonly string[]): string | null {
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (
    !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  )
    return null;
  url.hash = '';
  return url.toString();
}

/** The provider and its embed URL, or null when the link is not accepted. */
export function normalizeEmbedUrl(
  input: string,
  options: EmbedOptions = {},
): NormalizedEmbed | null {
  const url = parse(input);
  if (!url) return null;
  const fromYoutube = youtube(url);
  if (fromYoutube) return { provider: 'YOUTUBE', embedUrl: fromYoutube };
  const fromVimeo = vimeo(url);
  if (fromVimeo) return { provider: 'VIMEO', embedUrl: fromVimeo };
  const fromJitsi = jitsi(url, ['meet.jit.si', ...(options.jitsiHosts ?? [])]);
  if (fromJitsi) return { provider: 'JITSI', embedUrl: fromJitsi };
  const fromCustom = custom(url, options.customHosts ?? []);
  if (fromCustom) return { provider: 'CUSTOM_EMBED', embedUrl: fromCustom };
  return null;
}
