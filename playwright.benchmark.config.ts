import { defineConfig } from '@playwright/test';

// Standalone: the existing Lovable-managed config and production app stay intact.
export default defineConfig({
  testDir: './e2e/benchmarks',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium', trace: 'off', screenshot: 'off', video: 'off',
    launchOptions: process.env.TMS_BENCHMARK_CHROMIUM
      ? { executablePath: process.env.TMS_BENCHMARK_CHROMIUM }
      : {},
  },
});
