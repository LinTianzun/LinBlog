import { defineConfig, devices } from '@playwright/test'

// 用独立端口：本机常驻的开发服务器（VSCode 终端等）有时会占住默认端口，
// 复用或抢端口都会让用例对着旧代码跑。
const port = process.env.PLAYWRIGHT_PORT || '4174'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 本机默认满核并行时，Vite dev server 的冷编译与大量 mock route handler
  // 争用会随机拖慢个别页面（快照表现为 5-20 秒超时）。收敛到 4 个 worker。
  workers: process.env.CI ? 2 : 4,
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
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/loginRegister`,
    // 本地常驻的 dev server 不会可靠地拾取所有改动（例如 VSCode 终端里启动的实例），
    // 复用会让用例对着旧代码跑；每次测试都起一个干净的实例。
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
