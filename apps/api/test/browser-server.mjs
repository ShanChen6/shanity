// Test-only process. Never imported by the production application.
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/setup.js';
import { GoogleProvider } from '../dist/auth/google.service.js';
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.AUTH_BROWSER_TEST !== '1' ||
  !process.env.PGDATABASE?.endsWith('_test')
)
  throw new Error(
    'Browser fixture requires NODE_ENV=test, AUTH_BROWSER_TEST=1 and isolated *_test database',
  );
const prefix = randomUUID();
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(GoogleProvider)
  .useValue({
    client: () => ({}),
    verify: async (code) => {
      if (!/^[\w-]{1,80}$/.test(code)) throw new Error('Invalid test code');
      return {
        sub: `${prefix}-${code}`,
        email: `${prefix}-${code}@example.invalid`,
        name: 'Google Browser Test',
      };
    },
  })
  .compile();
const app = module.createNestApplication();
// Rate limits remain enabled; each test owns a separate limiter identity.
app.use((req, _res, next) => {
  if (req.headers['x-shanity-test-client'])
    Object.defineProperty(req, 'ip', {
      value: String(req.headers['x-shanity-test-client']),
    });
  next();
});
configureApp(app);
await app.listen(Number(process.env.PORT ?? 55462), '0.0.0.0');
