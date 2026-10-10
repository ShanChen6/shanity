import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Many suites boot the app and sign accounts up/in for real, and each
    // password hash is ~0.3 s of CPU and 128 MiB (scrypt N=2^17, on purpose).
    // With every file in parallel those hashes queue behind each other, so
    // the default 5 s / 10 s limits fail suites that are merely waiting.
    // Same limits as vitest.config.e2e.ts.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
