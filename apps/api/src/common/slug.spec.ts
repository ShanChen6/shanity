import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from './slug.js';

describe('slugify', () => {
  it('turns Vietnamese titles into ASCII slugs, đ included', () => {
    expect(slugify('Đường đi của Hàm trong JavaScript')).toBe(
      'duong-di-cua-ham-trong-javascript',
    );
    expect(slugify('Tối ưu hoá React: useMemo & useCallback!')).toBe(
      'toi-uu-hoa-react-usememo-usecallback',
    );
  });

  it('always yields a valid slug, even from nothing usable', () => {
    for (const title of ['   ', '!!!', '日本語', 'a'.repeat(500), '-x-'])
      expect(slugify(title)).toMatch(SLUG_PATTERN);
    expect(slugify('!!!')).toBe('bai-viet');
    expect(slugify('a b'.repeat(300)).length).toBeLessThanOrEqual(
      SLUG_MAX_LENGTH,
    );
  });
});
