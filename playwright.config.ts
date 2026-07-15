import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 20_000,
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: { command: './dev.sh', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 30_000 },
})
