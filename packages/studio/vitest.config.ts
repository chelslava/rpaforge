import os from 'node:os';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest's run-mode default (`availableParallelism() - 1`) counts hyper-threads
// on consumer CPUs: 7 fork workers on a 4-core/8-thread machine oversubscribe
// the CPU so badly that individual tests blow past their timeouts (issue #888 —
// reproduced as 3 timeout failures in one full-suite run; capping to
// ceil(cpus/2) made the suite both green and faster: 76s vs 98s). Machines with
// <=4 logical CPUs (CI runners) keep the vitest default of cpus-1.
const parallelism = os.availableParallelism();
const maxWorkers = parallelism > 4 ? Math.ceil(parallelism / 2) : Math.max(parallelism - 1, 1);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    maxWorkers,
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/setupTests.tsx'],
    exclude: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      'e2e/**',
      // Canvas perf benchmarks run via the dedicated bench config (`pnpm bench`).
      'bench/**',
    ],
  },
});
