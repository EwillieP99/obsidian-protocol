import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    testTimeout: 30_000,
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': root,
    },
  },
});
