import { OAuth2Client } from 'google-auth-library';
import { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
export interface GoogleIdentity {
    sub: string;
    email: string;
    name: string;
}
export declare class GoogleProvider {
    private readonly config;
    constructor(config: AuthConfig);
    client(): OAuth2Client;
    verify(code: string, verifier: string, nonce: string): Promise<GoogleIdentity>;
}
export declare class GoogleService {
    private readonly auth;
    private readonly provider;
    constructor(auth: AuthService, provider: GoogleProvider);
    start(linkSessionId?: string): Promise<{
        url: string;
        browser: string;
    }>;
    callback(state: unknown, browser: string | undefined, code: unknown, providerError: unknown, accessToken?: string): Promise<{
        linked: true;
        tokens?: undefined;
    } | {
        linked: false;
        tokens: {
            access: string;
            refresh: string;
        };
    }>;
}
