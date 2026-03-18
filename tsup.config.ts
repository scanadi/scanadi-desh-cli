import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node18',
    clean: true,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/bridge/server-entry.ts'],
    format: ['esm'],
    target: 'node18',
    sourcemap: true,
    // No shebang — this is forked, not run directly
  },
]);
