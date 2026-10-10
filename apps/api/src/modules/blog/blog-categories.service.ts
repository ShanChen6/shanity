import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uniqueViolation } from '../../auth/auth.service.js';
import { slugify } from '../../common/slug.js';
import type { CreateBlogCategoryDto } from './blog.dto.js';

export interface BlogCategoryView {
  id: string;
  name: string;
  slug: string;
}

@Injectable()
export class BlogCategoriesService {
  constructor(private readonly dataSource: DataSource) {}

  list(): Promise<BlogCategoryView[]> {
    return this.dataSource.query(
      `SELECT id, name, slug FROM categories ORDER BY name, id`,
    );
  }

  async create(dto: CreateBlogCategoryDto): Promise<BlogCategoryView> {
    try {
      const [row] = await this.dataSource.query<BlogCategoryView[]>(
        `INSERT INTO categories (name, slug) VALUES ($1, $2)
         RETURNING id, name, slug`,
        [dto.name, dto.slug ?? slugify(dto.name, 'chu-de')],
      );
      return row;
    } catch (cause) {
      if (uniqueViolation(cause))
        throw new ConflictException({
          statusCode: 409,
          message: 'BLOG_CATEGORY_SLUG_TAKEN',
          code: 'BLOG_CATEGORY_SLUG_TAKEN',
        });
      throw cause;
    }
  }
}
