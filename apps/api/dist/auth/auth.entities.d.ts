export declare class Role {
    code: string;
    name: string;
}
export declare class UserRole {
    user_id: string;
    role_code: string;
    assigned_at: Date;
}
export declare class AuthSession {
    id: string;
    user_id: string;
    refresh_hash: string;
    created_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
}
export declare class AuthIdentity {
    id: string;
    user_id: string;
    provider: string;
    provider_subject: string;
    created_at: Date;
}
export declare class OAuthRequest {
    state_hash: string;
    browser_hash: string;
    nonce: string;
    verifier: string;
    link_session_id: string | null;
    expires_at: Date;
}
export declare class AuthRateLimit {
    key: string;
    hits: number;
    expires_at: Date;
}
