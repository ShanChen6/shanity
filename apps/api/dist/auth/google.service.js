var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException, } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { AuthConfig } from './auth.config.js';
import { AuthService, uniqueViolation } from './auth.service.js';
import { digest, randomToken } from './password.js';
let GoogleProvider = class GoogleProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    client() {
        if (!this.config.googleId)
            throw new ServiceUnavailableException('Google OAuth is not configured');
        return new OAuth2Client({
            clientId: this.config.googleId,
            clientSecret: this.config.googleSecret,
            redirectUri: this.config.googleCallback,
            transporterOptions: { timeout: 10000 },
        });
    }
    async verify(code, verifier, nonce) {
        try {
            const client = this.client();
            const { tokens } = await client.getToken({
                code,
                codeVerifier: verifier,
            });
            if (!tokens.id_token)
                throw new Error('Missing ID token');
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: this.config.googleId,
            });
            const payload = ticket.getPayload();
            if (!payload ||
                payload.nonce !== nonce ||
                payload.email_verified !== true ||
                !payload.email ||
                !payload.sub)
                throw new Error('Invalid identity');
            return {
                sub: payload.sub,
                email: payload.email.trim().toLowerCase(),
                name: (payload.name || payload.email).slice(0, 100),
            };
        }
        catch {
            throw new UnauthorizedException('Google authentication failed');
        }
    }
};
GoogleProvider = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AuthConfig])
], GoogleProvider);
export { GoogleProvider };
let GoogleService = class GoogleService {
    auth;
    provider;
    constructor(auth, provider) {
        this.auth = auth;
        this.provider = provider;
    }
    async start(linkSessionId) {
        this.provider.client();
        const state = randomToken(), browser = randomToken(), nonce = randomToken(), verifier = randomToken();
        await this.auth.database.client('oauth_requests').insert({
            state_hash: digest(state),
            browser_hash: digest(browser),
            nonce,
            verifier,
            link_session_id: linkSessionId ?? null,
            expires_at: new Date(Date.now() + 600000),
        });
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.search = new URLSearchParams({
            client_id: this.auth.config.googleId,
            redirect_uri: this.auth.config.googleCallback,
            response_type: 'code',
            scope: 'openid email profile',
            state,
            nonce,
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
            prompt: 'select_account',
        }).toString();
        return { url: url.toString(), browser };
    }
    async callback(state, browser, code, providerError, accessToken) {
        if (typeof state !== 'string' ||
            !/^[\w-]{43}$/.test(state) ||
            !browser ||
            !/^[\w-]{43}$/.test(browser))
            throw new UnauthorizedException('Invalid OAuth state');
        const [flow] = await this.auth.database
            .client('oauth_requests')
            .where({ state_hash: digest(state), browser_hash: digest(browser) })
            .where('expires_at', '>', new Date())
            .delete()
            .returning('*');
        if (!flow)
            throw new UnauthorizedException('Invalid OAuth state');
        if (providerError ||
            typeof code !== 'string' ||
            code.length > 4096 ||
            !code)
            throw new UnauthorizedException('Google authentication cancelled or failed');
        if (flow.link_session_id) {
            const principal = await this.auth.authenticate(accessToken);
            if (principal.sessionId !== flow.link_session_id)
                throw new UnauthorizedException('OAuth linking session changed');
        }
        const identity = await this.provider.verify(code, flow.verifier, flow.nonce);
        try {
            return await this.auth.database.client.transaction(async (trx) => {
                await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
                    `google:${identity.sub}`,
                ]);
                let userId;
                if (flow.link_session_id) {
                    const session = await trx('auth_sessions')
                        .where({ id: flow.link_session_id })
                        .forUpdate()
                        .first();
                    if (!session ||
                        session.revoked_at ||
                        new Date(session.expires_at) <= new Date())
                        throw new UnauthorizedException();
                    userId = session.user_id;
                    const user = await trx('users')
                        .where({ id: userId })
                        .forUpdate()
                        .first();
                    if (user?.status !== 'active')
                        throw new UnauthorizedException();
                    const existing = await trx('auth_identities')
                        .where({ provider: 'google', provider_subject: identity.sub })
                        .first();
                    if (existing && existing.user_id !== userId)
                        throw new ConflictException('Google account already linked');
                    if (!existing)
                        await trx('auth_identities').insert({
                            provider: 'google',
                            provider_subject: identity.sub,
                            user_id: userId,
                        });
                    return { linked: true };
                }
                const existing = await trx('auth_identities')
                    .where({ provider: 'google', provider_subject: identity.sub })
                    .first();
                if (existing)
                    userId = existing.user_id;
                else {
                    const match = await trx('users')
                        .where({ email: identity.email })
                        .first('id');
                    if (match)
                        throw new ConflictException('Sign in to your existing account to link Google');
                    const [user] = await trx('users')
                        .insert({ email: identity.email, display_name: identity.name })
                        .returning('id');
                    userId = user.id;
                    await trx('user_roles').insert({
                        user_id: userId,
                        role_code: 'student',
                    });
                    await trx('auth_identities').insert({
                        provider: 'google',
                        provider_subject: identity.sub,
                        user_id: userId,
                    });
                }
                const user = await trx('users')
                    .where({ id: userId })
                    .forUpdate()
                    .first();
                if (user?.status !== 'active')
                    throw new UnauthorizedException();
                return {
                    linked: false,
                    tokens: await this.auth.issue(trx, userId),
                };
            });
        }
        catch (error) {
            if (uniqueViolation(error))
                throw new ConflictException('Account or Google identity already exists');
            throw error;
        }
    }
};
GoogleService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AuthService,
        GoogleProvider])
], GoogleService);
export { GoogleService };
//# sourceMappingURL=google.service.js.map