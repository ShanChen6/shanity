import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

// These properties retain the SQL names used by session/authorization logic.
@Entity('roles')
export class Role {
  @PrimaryColumn({ type: 'text' }) code: string;
  @Column({ type: 'text' }) name: string;
}

@Entity('user_roles')
@Index('user_roles_role_idx', ['role_code'])
export class UserRole {
  @PrimaryColumn({ type: 'uuid' }) user_id: string;
  @PrimaryColumn({ type: 'text' }) role_code: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) assigned_at: Date;
}

@Entity('auth_sessions')
@Index('auth_sessions_user_idx', ['user_id'])
@Index('auth_sessions_expiry_idx', ['expires_at'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'text', unique: true }) refresh_hash: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) created_at: Date;
  @Column({ type: 'timestamptz' }) expires_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) revoked_at: Date | null;
}

@Entity('auth_identities')
@Index('auth_identities_user_idx', ['user_id'])
@Index(['provider', 'provider_subject'], { unique: true })
export class AuthIdentity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'text' }) provider: string;
  @Column({ type: 'text' }) provider_subject: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) created_at: Date;
}

@Entity('oauth_requests')
@Index('oauth_requests_expiry_idx', ['expires_at'])
export class OAuthRequest {
  @PrimaryColumn({ type: 'text' }) state_hash: string;
  @Column({ type: 'text' }) browser_hash: string;
  @Column({ type: 'text' }) nonce: string;
  @Column({ type: 'text' }) verifier: string;
  @Column({ type: 'uuid', nullable: true }) link_session_id: string | null;
  @Column({ type: 'timestamptz' }) expires_at: Date;
}

@Entity('auth_rate_limits')
@Index('auth_rate_limits_expiry_idx', ['expires_at'])
export class AuthRateLimit {
  @PrimaryColumn({ type: 'text' }) key: string;
  @Column({ type: 'integer' }) hits: number;
  @Column({ type: 'timestamptz' }) expires_at: Date;
}
