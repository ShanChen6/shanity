import { Column, Entity, OneToMany } from 'typeorm';
import { Enrollment } from '../courses/enrollment.entity.js';
import { AuditedEntity } from '../database/audited.entity.js';

/** Maps the existing users table without changing its SQL constraints. */
@Entity('users')
export class User extends AuditedEntity {
  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({
    name: 'password_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  passwordHash: string | null;

  @Column({ type: 'text', default: 'active' })
  status: string;

  @Column({ name: 'avatar_key', type: 'text', nullable: true })
  avatarKey: string | null;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.user)
  enrollments: Enrollment[];
}
