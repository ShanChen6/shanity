import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // Every suite shares one real PostgreSQL database, and some assert on
    // global figures (user statistics): files run one at a time so they
    // cannot observe each other. Password hashing is slow, hence the timeout.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: [
      '**/*.e2e-spec.ts',
      'test/database/migrations/**/*.spec.ts',
      'test/modules/**/*.spec.ts',
    ],
  },
});
