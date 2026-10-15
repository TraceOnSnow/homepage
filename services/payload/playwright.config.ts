import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  timeout: 120_000, expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:3100', actionTimeout: 25_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:3100/admin', reuseExistingServer: false, timeout: 180_000 },
})
