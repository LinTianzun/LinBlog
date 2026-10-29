import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 本机没有官方 chromium 时（公司网络下载 CDN 很慢）回落到系统安装的
        // Chrome；CI 里 PLAYWRIGHT_CHANNEL 不设置，仍用 npx playwright install
        // 下载的官方构建，保证与 Linux runner 行为一致。
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: `${baseURL}/loginRegister`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
