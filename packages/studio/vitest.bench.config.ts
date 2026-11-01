import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Dedicated config for the canvas perf benchmark suite (issue #830).
 * Runs only `bench/**` in a node environment — the nightly CI bench job
 * invokes it via `pnpm bench` and gates results against bench/baseline.json
 * with .github/scripts/bench_gate.py.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Benchmarks run through `benchmark.include` below; the regular test
    // run is intentionally empty in this config (nightly bench job only).
    include: ['**/*.nobench.ts'],
    passWithNoTests: true,
  },
  benchmark: {
    include: ['bench/**/*.bench.ts'],
  },
});
