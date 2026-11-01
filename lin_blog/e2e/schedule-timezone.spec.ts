import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'

/**
 * 回归：定时发布的"本地时间"必须以服务器时区为准。
 * 曾经前端用浏览器时区算"1 小时后"，浏览器时区与用户挂钟/服务器不一致时
 * 会把发布时间算错数小时（如 14:54 点"1 小时后"得到 05:54）。
 * mock 的 /api/time/now 固定东八区，这里把浏览器时区改成明显不同的值，
 * 断言预设仍落在服务器时区的"当前 +1 小时"。
 */
for (const timezoneId of ['Asia/Shanghai', 'UTC', 'Etc/GMT+2']) {
  test.describe(`定时发布预设按服务器时区计算（浏览器 ${timezoneId}）`, () => {
    test.use({ timezoneId })

    test('点击「1 小时后」得到服务器时区的下一小时', async ({ page }) => {
      await seedSession(page, {
        id: 1,
        isSuperAdmin: true,
        username: '林知雨',
        mail: 'admin@linlog.com',
        permissions: [
          'article.create',
          'article.manageAll',
          'article.viewAll',
          'article.publish',
        ],
      })
      await installApiMock(page)

      await page.goto(`/editarticle/${article.id}`)
      await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

      await page.getByRole('button', { name: '定时发布' }).click()
      await page.getByText('安排发布时间').click()
      const dialog = page.locator('.yk-modal__main:visible').last()
      const input = dialog.locator('input[type="datetime-local"]')

      // 服务器时区（+480）下的"当前 +1 小时"，独立于浏览器时区
      const expected = await page.evaluate(() => {
        const shifted = new Date(Date.now() + 60 * 60 * 1000 + 480 * 60_000)
        const pad = (value: number) => String(value).padStart(2, '0')
        return [
          shifted.getUTCFullYear(),
          '-',
          pad(shifted.getUTCMonth() + 1),
          '-',
          pad(shifted.getUTCDate()),
          'T',
          pad(shifted.getUTCHours()),
          ':',
          pad(shifted.getUTCMinutes()),
        ].join('')
      })

      await dialog.getByRole('button', { name: '1 小时后' }).click()
      const value = await input.inputValue()

      // 允许跨分钟边界的 1 分钟误差
      const diffMinutes = Math.abs(
        (new Date(`${value}:00`).getTime() - new Date(`${expected}:00`).getTime()) / 60_000
      )
      expect(diffMinutes).toBeLessThanOrEqual(1)

      // 预览文案与输入框一致，不再出现浏览器时区的偏移
      await expect(dialog.locator('.schedule-dialog-preview')).toContainText(
        `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
      )
    })
  })
}
