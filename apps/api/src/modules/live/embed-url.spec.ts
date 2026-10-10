import { describe, expect, it } from 'vitest';
import { normalizeEmbedUrl } from './embed-url.js';

const yt = (id: string) => ({
  provider: 'YOUTUBE',
  embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1`,
});

describe('normalizeEmbedUrl', () => {
  it('turns every common YouTube link into the embed URL', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'http://youtube.com/watch?v=dQw4w9WgXcQ',
    ])
      expect(normalizeEmbedUrl(link), link).toEqual(yt('dQw4w9WgXcQ'));
  });

  it('turns Vimeo videos, unlisted videos and live events into player URLs', () => {
    expect(normalizeEmbedUrl('https://vimeo.com/76979871')).toEqual({
      provider: 'VIMEO',
      embedUrl: 'https://player.vimeo.com/video/76979871?autoplay=1',
    });
    expect(
      normalizeEmbedUrl('https://vimeo.com/76979871/a1b2c3d4e5')?.embedUrl,
    ).toBe('https://player.vimeo.com/video/76979871?autoplay=1&h=a1b2c3d4e5');
    expect(
      normalizeEmbedUrl('https://player.vimeo.com/video/76979871?h=ff00')
        ?.embedUrl,
    ).toBe('https://player.vimeo.com/video/76979871?autoplay=1&h=ff00');
    expect(normalizeEmbedUrl('https://vimeo.com/event/4012345')).toEqual({
      provider: 'VIMEO',
      embedUrl: 'https://vimeo.com/event/4012345/embed?autoplay=1',
    });
  });

  it('accepts Jitsi rooms on meet.jit.si and configured servers', () => {
    expect(normalizeEmbedUrl('https://meet.jit.si/Shanity-JS-Buoi-3')).toEqual({
      provider: 'JITSI',
      embedUrl: 'https://meet.jit.si/Shanity-JS-Buoi-3',
    });
    expect(
      normalizeEmbedUrl('https://jitsi.shanity.vn/lop-a', {
        jitsiHosts: ['jitsi.shanity.vn'],
      })?.provider,
    ).toBe('JITSI');
    expect(normalizeEmbedUrl('https://meet.jit.si/a/b')).toBeNull();
  });

  it('allows custom embeds only from approved https hosts', () => {
    const options = { customHosts: ['stream.shanity.vn'] };
    expect(
      normalizeEmbedUrl('https://stream.shanity.vn/live/1#x', options),
    ).toEqual({
      provider: 'CUSTOM_EMBED',
      embedUrl: 'https://stream.shanity.vn/live/1',
    });
    expect(
      normalizeEmbedUrl('http://stream.shanity.vn/live/1', options),
    ).toBeNull();
    expect(normalizeEmbedUrl('https://stream.shanity.vn/live/1')).toBeNull();
  });

  it('refuses everything else', () => {
    for (const link of [
      '',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/@channel',
      'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/about',
      'ftp://vimeo.com/76979871',
    ])
      expect(normalizeEmbedUrl(link), link).toBeNull();
  });
});
