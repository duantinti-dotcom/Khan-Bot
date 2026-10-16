import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// Usa o Chromium pré-instalado quando disponível (ambientes de CI/containers).
const localChromium = '/opt/pw-browsers/chromium'
const launchOptions = existsSync(localChromium) && !process.env.PW_DEFAULT_BROWSER ? { executablePath: localChromium } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
})
