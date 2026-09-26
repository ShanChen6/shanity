import { AuthConfig } from './auth.config.js';

describe('Auth configuration', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-only-secret-with-at-least-32-bytes');
    vi.stubEnv('JWT_ACCESS_SECONDS', '900');
    vi.stubEnv('AUTH_REFRESH_SECONDS', '2592000');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    vi.stubEnv('GOOGLE_CALLBACK_URL', '');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rejects missing secrets and invalid lifetimes', () => {
    vi.stubEnv('JWT_SECRET', '');
    expect(() => new AuthConfig()).toThrow('JWT_SECRET');
    vi.stubEnv('JWT_SECRET', 'test-only-secret-with-at-least-32-bytes');
    vi.stubEnv('JWT_ACCESS_SECONDS', '999999');
    expect(() => new AuthConfig()).toThrow('JWT_ACCESS_SECONDS');
  });
  it('requires complete Google configuration', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test');
    expect(() => new AuthConfig()).toThrow('GOOGLE');
  });
  it('rejects callback URLs that do not match the backend route', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test');
    vi.stubEnv('GOOGLE_CALLBACK_URL', 'http://localhost:4000/wrong');
    expect(() => new AuthConfig()).toThrow('/auth/google/callback');
    vi.stubEnv(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:4000/auth/google/callback',
    );
    expect(() => new AuthConfig()).not.toThrow();
  });
  it('requires HTTPS and secure host cookies in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new AuthConfig()).toThrow('HTTPS');
    vi.stubEnv('WEB_ORIGIN', 'https://learn.example');
    const config = new AuthConfig();
    expect(config.cookieName('refresh')).toBe('__Host-shanity_refresh');
    expect(config.cookieOptions(60)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
});
