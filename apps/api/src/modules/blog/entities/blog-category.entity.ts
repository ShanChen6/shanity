import { Column, Entity, Unique } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';

/** A blog topic. Slug: lowercase words joined by hyphens (CHECK). */
@Entity('categories')
@Unique('categories_slug_key', ['slug'])
export class BlogCategory extends AuditedEntity {
  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  name: string;
}
