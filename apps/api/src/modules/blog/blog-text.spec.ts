import { describe, expect, it } from 'vitest';
import { plainExcerpt, readingMinutes } from './blog-text.js';

describe('plainExcerpt', () => {
  it('keeps the words and drops Markdown, code and math', () => {
    expect(
      plainExcerpt(
        '# Tiêu đề\n\nĐây là **đậm** và [liên kết](https://x.dev).\n\n```js\nconst a = 1\n```\n\n$$E=mc^2$$\n\n- mục `code` một',
      ),
    ).toBe('Tiêu đề Đây là đậm và liên kết. mục một');
  });

  it('cuts at a word boundary with an ellipsis', () => {
    const text = 'từ '.repeat(100);
    const excerpt = plainExcerpt(text, 50);
    expect(excerpt.length).toBeLessThanOrEqual(50);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/ …$/);
  });
});

describe('readingMinutes', () => {
  it('rounds and never says zero', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(450)).toBe(2);
  });
});
