import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { GoogleProvider } from './google.service.js';
import type { AuthConfig } from './auth.config.js';

describe('Google identity validation', () => {
  const config = {
    googleId: 'client-id',
    googleSecret: 'secret',
    googleCallback: 'http://localhost:4000/auth/google/callback',
  } as AuthConfig;
  afterEach(() => vi.restoreAllMocks());
  it('rejects invalid signatures/provider errors, unverified email and mismatched nonce', async () => {
    const provider = new GoogleProvider(config);
    const client = provider.client();
    vi.spyOn(provider, 'client').mockReturnValue(client);
    vi.spyOn(client, 'getToken').mockResolvedValue({
      tokens: { id_token: 'provider-token' },
    } as never);
    const verify = vi.spyOn(client, 'verifyIdToken');
    verify.mockRejectedValueOnce(new Error('Invalid signature'));
    await expect(provider.verify('code', 'verifier', 'nonce')).rejects.toThrow(
      'Google authentication failed',
    );
    for (const payload of [
      {
        sub: 'sub',
        email: 'a@example.com',
        email_verified: false,
        nonce: 'nonce',
      },
      {
        sub: 'sub',
        email: 'a@example.com',
        email_verified: true,
        nonce: 'wrong',
      },
    ]) {
      verify.mockResolvedValueOnce({ getPayload: () => payload } as never);
      await expect(
        provider.verify('code', 'verifier', 'nonce'),
      ).rejects.toThrow('Google authentication failed');
    }
    verify.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'sub',
        email: 'A@example.com',
        email_verified: true,
        nonce: 'nonce',
        name: 'Name',
      }),
    } as never);
    await expect(provider.verify('code', 'verifier', 'nonce')).resolves.toEqual(
      { sub: 'sub', email: 'a@example.com', name: 'Name' },
    );
    expect(verify).toHaveBeenLastCalledWith({
      idToken: 'provider-token',
      audience: 'client-id',
    });
  });
});

describe('Google ID token cryptographic validation', () => {
  it('verifies real signatures and rejects wrong audience, issuer, expired tokens and signatures', async () => {
    const config = {
      googleId: 'test-client',
      googleSecret: 'test-secret',
      googleCallback: 'http://localhost:4000/auth/google/callback',
    } as AuthConfig;
    const provider = new GoogleProvider(config);
    const client = provider.client();
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.spyOn(provider, 'client').mockReturnValue(client);
    vi.spyOn(client, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: { test: publicKey.export({ type: 'spki', format: 'pem' }) },
      format: 'PEM',
    } as never);
    const exchange = vi.spyOn(client, 'getToken');
    const now = Math.floor(Date.now() / 1000);
    for (const [audience, issuer, expiry, key, valid] of [
      [
        'test-client',
        'https://accounts.google.com',
        now + 600,
        privateKey,
        true,
      ],
      [
        'wrong-client',
        'https://accounts.google.com',
        now + 600,
        privateKey,
        false,
      ],
      ['test-client', 'https://attacker.example', now + 600, privateKey, false],
      [
        'test-client',
        'https://accounts.google.com',
        now - 600,
        privateKey,
        false,
      ],
      [
        'test-client',
        'https://accounts.google.com',
        now + 600,
        other.privateKey,
        false,
      ],
    ] as const) {
      const token = await new SignJWT({
        nonce: 'nonce',
        email: 'verified@example.invalid',
        email_verified: true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('google-subject')
        .setAudience(audience)
        .setIssuer(issuer)
        .setIssuedAt(now - 1200)
        .setExpirationTime(expiry)
        .sign(key);
      exchange.mockResolvedValueOnce({ tokens: { id_token: token } } as never);
      const verification = provider.verify(
        'authorization-code',
        'pkce-verifier',
        'nonce',
      );
      if (valid)
        await expect(verification).resolves.toMatchObject({
          sub: 'google-subject',
        });
      else
        await expect(verification).rejects.toThrow(
          'Google authentication failed',
        );
    }
    expect(exchange).toHaveBeenLastCalledWith({
      code: 'authorization-code',
      codeVerifier: 'pkce-verifier',
    });
    vi.restoreAllMocks();
  });
});
