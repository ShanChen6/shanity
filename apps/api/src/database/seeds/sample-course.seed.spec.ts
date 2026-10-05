import { describe, expect, it } from 'vitest';
import {
  buildSeedPdf,
  SAMPLE_CHAPTERS,
  SAMPLE_COURSE_SLUG,
  SAMPLE_LESSONS,
} from './sample-course.seed.js';

describe('sample JavaScript course seed', () => {
  it('defines the exact deterministic 3 x 3 curriculum', () => {
    expect(SAMPLE_COURSE_SLUG).toBe('javascript-co-ban-cho-nguoi-moi');
    expect(SAMPLE_CHAPTERS.map((chapter) => chapter.position)).toEqual([1, 2, 3]);
    expect(SAMPLE_LESSONS).toHaveLength(9);
    for (let chapterIndex = 0; chapterIndex < 3; chapterIndex += 1) {
      expect(SAMPLE_LESSONS.filter((lesson) => lesson.chapterIndex === chapterIndex)
        .map((lesson) => lesson.position)).toEqual([1, 2, 3]);
    }
    expect(SAMPLE_LESSONS.map((lesson) => lesson.type)).toEqual([
      'TEXT', 'VIDEO', 'DOCUMENT', 'VIDEO', 'TEXT', 'DOCUMENT', 'VIDEO', 'TEXT', 'DOCUMENT',
    ]);
  });

  it('exposes only the introductory lesson as a guest preview', () => {
    expect(SAMPLE_LESSONS.filter((lesson) => lesson.isPreview).map((lesson) => lesson.slug))
      .toEqual(['javascript-la-gi']);
  });

  it('contains substantive safe text and usable public video URLs', () => {
    for (const lesson of SAMPLE_LESSONS.filter((item) => item.type === 'TEXT')) {
      expect(lesson.textBody?.length).toBeGreaterThan(500);
      expect(lesson.textBody).not.toMatch(/lorem ipsum|<script|onerror=/i);
    }
    for (const lesson of SAMPLE_LESSONS.filter((item) => item.type === 'VIDEO')) {
      expect(() => new URL(lesson.externalUrl ?? '')).not.toThrow();
      expect(lesson.externalUrl).toContain('youtube.com/watch');
    }
  });

  it('generates valid-looking non-empty PDF assets', () => {
    const pdf = buildSeedPdf(['JavaScript guide', 'const answer = 42;']);
    expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    expect(pdf.toString('ascii')).toContain('%%EOF');
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
