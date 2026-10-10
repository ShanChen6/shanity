import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateBlogPostDto } from './blog.dto.js';

const coverErrors = async (coverImage: unknown) => {
  const dto = plainToInstance(CreateBlogPostDto, { title: 'Bài', coverImage });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'coverImage');
};

describe('CreateBlogPostDto.coverImage', () => {
  it('accepts an uploaded image path, so posts survive a domain change', async () => {
    expect(
      await coverErrors('/blog-images/0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21'),
    ).toEqual([]);
  });

  it('accepts http(s) images elsewhere and blank (no cover)', async () => {
    expect(await coverErrors('https://cdn.example.com/a.png')).toEqual([]);
    expect(await coverErrors('  ')).toEqual([]);
  });

  it('rejects other paths and schemes', async () => {
    for (const value of [
      '/blog-images/../../etc/passwd',
      '/course-media/0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21',
      'javascript:alert(1)',
      'blog-images/0b9f8d3e-4c2a-4f1e-9a7b-2d6c5e4f3a21',
    ])
      expect(await coverErrors(value)).toHaveLength(1);
  });
});
