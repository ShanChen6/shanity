import { sanitizeLessonHtml } from './html-sanitizer.js';

describe('sanitizeLessonHtml', () => {
  it('removes executable markup and inline event handlers', () => {
    expect(
      sanitizeLessonHtml(
        `<script>alert('XSS')</script><h1>Bài học 1</h1><img src=x onerror=alert(1) />`,
      ),
    ).toBe('<h1>Bài học 1</h1><img src="x" />');
  });

  it('preserves formatting and hardens links', () => {
    const result = sanitizeLessonHtml(
      '<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em></p><pre><code>const safe = true;</code></pre><ul><li>One</li></ul><blockquote>Note</blockquote><a href="https://example.com">Read</a>',
    );
    expect(result).toContain('<h2>Heading</h2>');
    expect(result).toContain('<pre><code>const safe = true;</code></pre>');
    expect(result).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Read</a>',
    );
  });

  it('drops unsafe URLs and dangerous embedded elements', () => {
    const result = sanitizeLessonHtml(
      '<a href="javascript:alert(1)" onclick="alert(1)">Bad</a><iframe src="https://evil.invalid"></iframe><object></object><embed><applet></applet>',
    );
    expect(result).not.toMatch(
      /javascript:|onclick|iframe|object|embed|applet/i,
    );
  });

  it('returns empty content when the payload contains only executable HTML', () => {
    expect(sanitizeLessonHtml('<script>alert(1)</script>')).toBe('');
  });
});
