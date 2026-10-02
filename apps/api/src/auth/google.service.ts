import {
  OAuthRequest,
  AuthSession,
  AuthIdentity,
  UserRole,
} from './auth.entities.js';

import { User } from '../users/user.entity.js';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { AuthConfig } from './auth.config.js';
import { AuthService, uniqueViolation } from './auth.service.js';
import { digest, randomToken } from './password.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}
@Injectable()
export class GoogleProvider {
  constructor(private readonly config: AuthConfig) {}
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
  async verify(
    code: string,
    verifier: string,
    nonce: string,
  ): Promise<GoogleIdentity> {
    try {
      const client = this.client();
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier,
      });
      if (!tokens.id_token) throw new Error('Missing ID token');
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.config.googleId,
      });
      const payload = ticket.getPayload();
      if (
        !payload ||
        (payload as unknown as { nonce?: string }).nonce !== nonce ||
        payload.email_verified !== true ||
        !payload.email ||
        !payload.sub
      )
        throw new Error('Invalid identity');
      return {
        sub: payload.sub,
        email: payload.email.trim().toLowerCase(),
        name: (payload.name || payload.email).slice(0, 100),
      };
    } catch {
      throw new UnauthorizedException('Google authentication failed');
    }
  }
}
@Injectable()
export class GoogleService {
  constructor(
    private readonly auth: AuthService,
    private readonly provider: GoogleProvider,
  ) {}
  async start(linkSessionId?: string) {
    this.provider.client();
    const state = randomToken(),
      browser = randomToken(),
      nonce = randomToken(),
      verifier = randomToken();
    await this.auth.database.dataSource.manager
      .getRepository(OAuthRequest)
      .insert({
        state_hash: digest(state),
        browser_hash: digest(browser),
        nonce: nonce,
        verifier: verifier,
        link_session_id: linkSessionId ?? null,
        expires_at: new Date(Date.now() + 600000),
      })
      .then((result) => result.raw);
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
  async callback(
    state: unknown,
    browser: string | undefined,
    code: unknown,
    providerError: unknown,
    accessToken?: string,
  ) {
    if (
      typeof state !== 'string' ||
      !/^[\w-]{43}$/.test(state) ||
      !browser ||
      !/^[\w-]{43}$/.test(browser)
    )
      throw new UnauthorizedException('Invalid OAuth state');
    // Atomic one-time consume; an error/cancellation also consumes the request.
    const flow = (
      await this.auth.database.dataSource
        .createQueryBuilder()
        .delete()
        .from(OAuthRequest)
        .where('state_hash = :stateHash', { stateHash: digest(state) })
        .andWhere('browser_hash = :browserHash', {
          browserHash: digest(browser),
        })
        .andWhere('expires_at > :now', { now: new Date() })
        .returning('*')
        .execute()
    ).raw[0] as OAuthRequest | undefined;
    if (!flow) throw new UnauthorizedException('Invalid OAuth state');
    if (
      providerError ||
      typeof code !== 'string' ||
      code.length > 4096 ||
      !code
    )
      throw new UnauthorizedException(
        'Google authentication cancelled or failed',
      );
    if (flow.link_session_id) {
      const principal = await this.auth.authenticate(accessToken);
      if (principal.sessionId !== flow.link_session_id)
        throw new UnauthorizedException('OAuth linking session changed');
    }
    const identity = await this.provider.verify(
      code,
      flow.verifier as string,
      flow.nonce as string,
    );
    try {
      return await this.auth.database.dataSource.transaction(async (trx) => {
        // Serialize login/link for the same identity across API instances.
        // The existing UNIQUE constraint remains the final integrity boundary.
        await trx.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`google:${identity.sub}`],
        );
        let userId: string;
        if (flow.link_session_id) {
          const session = await trx.getRepository(AuthSession).findOne({
            where: { id: flow.link_session_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            !session ||
            session.revoked_at ||
            new Date(session.expires_at) <= new Date()
          )
            throw new UnauthorizedException();
          userId = session.user_id as string;
          const user = await trx.getRepository(User).findOne({
            where: { id: userId },
            select: { id: true, status: true },
            lock: { mode: 'pessimistic_write' },
          });
          if (user?.status !== 'active') throw new UnauthorizedException();
          const existing = await trx.getRepository(AuthIdentity).findOne({
            where: { provider: 'google', provider_subject: identity.sub },
          });
          if (existing && existing.user_id !== userId)
            throw new ConflictException('Google account already linked');
          if (!existing)
            await trx
              .getRepository(AuthIdentity)
              .insert({
                provider: 'google',
                provider_subject: identity.sub,
                user_id: userId,
              })
              .then((result) => result.raw);
          return { linked: true as const };
        }
        const existing = await trx.getRepository(AuthIdentity).findOne({
          where: { provider: 'google', provider_subject: identity.sub },
        });
        if (existing) userId = existing.user_id as string;
        else {
          // Never attach an identity based only on matching email.
          const match = await trx.getRepository(User).findOne({
            where: { email: identity.email },
            select: { id: true },
          });
          if (match)
            throw new ConflictException(
              'Sign in to your existing account to link Google',
            );
          const [user] = await trx
            .getRepository(User)
            .insert({ email: identity.email, displayName: identity.name })
            .then((result) => result.raw);
          userId = user.id as string;
          await trx
            .getRepository(UserRole)
            .insert({ user_id: userId, role_code: 'student' })
            .then((result) => result.raw);
          await trx
            .getRepository(AuthIdentity)
            .insert({
              provider: 'google',
              provider_subject: identity.sub,
              user_id: userId,
            })
            .then((result) => result.raw);
        }
        const user = await trx.getRepository(User).findOne({
          where: { id: userId },
          select: { id: true, status: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (user?.status !== 'active') throw new UnauthorizedException();
        return {
          linked: false as const,
          tokens: await this.auth.issue(trx, userId),
        };
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException(
          'Account or Google identity already exists',
        );
      throw error;
    }
  }
}
