import { Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The audit standard for every mutable aggregate: UUID primary key plus
 * created_at / updated_at. PostgreSQL triggers advance updated_at for ORM and
 * raw SQL writes alike, so the columns stay truthful whoever writes them.
 *
 * Deliberately not here: deleted_at. See docs/architecture.md ("Quy ước dữ liệu")
 * for why it is opt-in per aggregate rather than blanket.
 */
export abstract class AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
