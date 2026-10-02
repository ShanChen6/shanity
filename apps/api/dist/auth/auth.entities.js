var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, } from 'typeorm';
let Role = class Role {
    code;
    name;
};
__decorate([
    PrimaryColumn({ type: 'text' }),
    __metadata("design:type", String)
], Role.prototype, "code", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], Role.prototype, "name", void 0);
Role = __decorate([
    Entity('roles')
], Role);
export { Role };
let UserRole = class UserRole {
    user_id;
    role_code;
    assigned_at;
};
__decorate([
    PrimaryColumn({ type: 'uuid' }),
    __metadata("design:type", String)
], UserRole.prototype, "user_id", void 0);
__decorate([
    PrimaryColumn({ type: 'text' }),
    __metadata("design:type", String)
], UserRole.prototype, "role_code", void 0);
__decorate([
    Column({ type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], UserRole.prototype, "assigned_at", void 0);
UserRole = __decorate([
    Entity('user_roles'),
    Index('user_roles_role_idx', ['role_code'])
], UserRole);
export { UserRole };
let AuthSession = class AuthSession {
    id;
    user_id;
    refresh_hash;
    created_at;
    expires_at;
    revoked_at;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], AuthSession.prototype, "id", void 0);
__decorate([
    Column({ type: 'uuid' }),
    __metadata("design:type", String)
], AuthSession.prototype, "user_id", void 0);
__decorate([
    Column({ type: 'text', unique: true }),
    __metadata("design:type", String)
], AuthSession.prototype, "refresh_hash", void 0);
__decorate([
    Column({ type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], AuthSession.prototype, "created_at", void 0);
__decorate([
    Column({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], AuthSession.prototype, "expires_at", void 0);
__decorate([
    Column({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], AuthSession.prototype, "revoked_at", void 0);
AuthSession = __decorate([
    Entity('auth_sessions'),
    Index('auth_sessions_user_idx', ['user_id']),
    Index('auth_sessions_expiry_idx', ['expires_at'])
], AuthSession);
export { AuthSession };
let AuthIdentity = class AuthIdentity {
    id;
    user_id;
    provider;
    provider_subject;
    created_at;
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], AuthIdentity.prototype, "id", void 0);
__decorate([
    Column({ type: 'uuid' }),
    __metadata("design:type", String)
], AuthIdentity.prototype, "user_id", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], AuthIdentity.prototype, "provider", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], AuthIdentity.prototype, "provider_subject", void 0);
__decorate([
    Column({ type: 'timestamptz', default: () => 'now()' }),
    __metadata("design:type", Date)
], AuthIdentity.prototype, "created_at", void 0);
AuthIdentity = __decorate([
    Entity('auth_identities'),
    Index('auth_identities_user_idx', ['user_id']),
    Index(['provider', 'provider_subject'], { unique: true })
], AuthIdentity);
export { AuthIdentity };
let OAuthRequest = class OAuthRequest {
    state_hash;
    browser_hash;
    nonce;
    verifier;
    link_session_id;
    expires_at;
};
__decorate([
    PrimaryColumn({ type: 'text' }),
    __metadata("design:type", String)
], OAuthRequest.prototype, "state_hash", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], OAuthRequest.prototype, "browser_hash", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], OAuthRequest.prototype, "nonce", void 0);
__decorate([
    Column({ type: 'text' }),
    __metadata("design:type", String)
], OAuthRequest.prototype, "verifier", void 0);
__decorate([
    Column({ type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], OAuthRequest.prototype, "link_session_id", void 0);
__decorate([
    Column({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], OAuthRequest.prototype, "expires_at", void 0);
OAuthRequest = __decorate([
    Entity('oauth_requests'),
    Index('oauth_requests_expiry_idx', ['expires_at'])
], OAuthRequest);
export { OAuthRequest };
let AuthRateLimit = class AuthRateLimit {
    key;
    hits;
    expires_at;
};
__decorate([
    PrimaryColumn({ type: 'text' }),
    __metadata("design:type", String)
], AuthRateLimit.prototype, "key", void 0);
__decorate([
    Column({ type: 'integer' }),
    __metadata("design:type", Number)
], AuthRateLimit.prototype, "hits", void 0);
__decorate([
    Column({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], AuthRateLimit.prototype, "expires_at", void 0);
AuthRateLimit = __decorate([
    Entity('auth_rate_limits'),
    Index('auth_rate_limits_expiry_idx', ['expires_at'])
], AuthRateLimit);
export { AuthRateLimit };
//# sourceMappingURL=auth.entities.js.map