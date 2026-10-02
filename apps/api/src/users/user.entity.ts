import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Maps the existing users table without changing its SQL constraints. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'update_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
