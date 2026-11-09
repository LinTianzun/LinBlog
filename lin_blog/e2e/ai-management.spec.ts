import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const MANAGE_PERMISSIONS = ['ai.manage', 'ai.use']

// 后端回传 ISO（UTC），页面按浏览器本地时区显示；断言时同样换算本地时间
const localText = (iso: string): string => {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

test('AI 管理页展示接入模型并可保存用量策略', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiManage')
  await expect(page.locator('.ai-model-card')).toHaveCount(1, { timeout: 30_000 })

  // 概览卡：接入模型数与默认模型名
  await expect(page.locator('.ai-overview')).toContainText('接入模型')
  await expect(page.locator('.ai-overview')).toContainText('智谱 GLM')

  // 模型卡：关键信息与掩码密钥
  const card = page.locator('.ai-model-card').first()
  await expect(card).toContainText('glm-4-flash')
  await expect(card).toContainText('cogview-3-flash')
  await expect(card).toContainText('1344x768')
  await expect(card).toContainText('********7890')
  await expect(card).not.toContainText('sk-')
  await expect(card).toContainText('默认')

  // 模型级限额：展示在卡片事实区
  await expect(card).toContainText('模型限额')
  await expect(card).toContainText('每日 10 次')

  // 调用记录：功能名与状态
  await expect(page.locator('.ai-usage-item')).toContainText('写作建议')
  await expect(page.locator('.ai-usage-item')).toContainText('成功')

  // 用量策略：改成每日 5 次并保存
  const dailyRow = page.locator('.ai-policy-row').filter({ hasText: '每用户每日上限' })
  await dailyRow.locator('input').fill('5')
  await page.getByRole('button', { name: '保存策略' }).click()
  await expect(dailyRow.locator('input')).toHaveValue('5')
  await expect(page.locator('.ai-policy-tip')).toContainText('5')
})

test('接入模型弹窗按分组展示字段且可填写密钥', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiManage')
  await expect(page.locator('.ai-model-card')).toHaveCount(1, { timeout: 30_000 })

  await page.getByRole('button', { name: '+ 接入模型' }).first().click()
  const modal = page.locator('.yk-modal__main')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.ai-form-group-title')).toHaveCount(3)
  await expect(modal).toContainText('基础信息')
  await expect(modal).toContainText('模型能力')
  await expect(modal).toContainText('高级选项')

  // 密钥默认掩码，可切换明文
  const secretInput = modal.locator('.ai-form-secret input')
  await expect(secretInput).toHaveAttribute('type', 'password')
  await secretInput.fill('sk-demo-key')
  await modal.getByRole('button', { name: '显示' }).click()
  await expect(secretInput).toHaveAttribute('type', 'text')

  await modal.locator('input[placeholder="例如：智谱 GLM"]').fill('演示模型')
  await modal.locator('input[placeholder="https://open.bigmodel.cn/api/paas/v4"]').fill('https://ai.example.test/v4')
  await modal.locator('input[placeholder="glm-4-flash"]').fill('glm-4-flash')
})

test('可以从环境变量导入 AI 配置', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiManage')
  await expect(page.locator('.ai-model-card')).toHaveCount(1, { timeout: 30_000 })

  await page.getByRole('button', { name: '导入环境变量配置' }).click()
  await expect(page.locator('.ai-model-card')).toHaveCount(1)
  // 导入后要有可见反馈，且页面主体不被提示替换
  await expect(page.locator('.ai-banner.is-success')).toContainText('环境变量配置')
  await expect(page.locator('.ai-model-card')).toHaveCount(1)
})

test('没有 ai.manage 权限时侧边栏不显示 AI 管理入口', async ({ page }) => {
  await seedSession(page, {
    id: 5,
    isSuperAdmin: false,
    username: '普通用户',
    mail: 'user@example.com',
    permissions: ['ai.use'],
  })
  await installApiMock(page)

  await page.goto('/systemLog')
  await expect(page.locator('.menu-bar')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.menu-bar').getByText('AI 管理', { exact: true })).toHaveCount(0)

  // 直接访问也会被路由守卫拦回
  await page.goto('/aiManage')
  await expect(page).not.toHaveURL(/\/aiManage$/)
})

test('AI 管理页展示用量统计面板', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiManage')
  await expect(page.locator('.ai-stats-window')).toHaveCount(3, { timeout: 30_000 })

  // 三个时间窗口：近 7 天 / 近 30 天 / 累计
  const windows = page.locator('.ai-stats-window')
  await expect(windows.nth(0)).toContainText('近 7 天')
  await expect(windows.nth(0)).toContainText('12')
  await expect(windows.nth(0)).toContainText('100%')
  await expect(windows.nth(1)).toContainText('近 30 天')
  await expect(windows.nth(2)).toContainText('累计')
  await expect(windows.nth(2)).toContainText('42')

  // 按模型与按功能分组
  const modelBreak = page.locator('.ai-stats-break').first()
  const featureBreak = page.locator('.ai-stats-break').nth(1)
  await expect(modelBreak).toContainText('按模型')
  await expect(featureBreak).toContainText('按功能')
  await expect(modelBreak.locator('.ai-stats-list')).toContainText('glm-4-flash')
  await expect(featureBreak.locator('.ai-stats-list')).toContainText('写作建议')

  // 模型健康与每日趋势
  await expect(page.locator('.ai-stats-break').nth(2)).toContainText('模型健康')
  await expect(page.locator('.ai-stats-break').nth(3)).toContainText('每日趋势')
  await expect(page.locator('.ai-stats-break').nth(2)).toContainText('智谱 GLM')

  // 每日趋势改用 ECharts 折线，不再是长列表
  await expect(page.locator('.ai-trend-chart canvas')).toBeVisible()
})

test('连通性测试后模型健康信息立即刷新', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiManage')
  await expect(page.locator('.ai-model-card')).toHaveCount(1, { timeout: 30_000 })

  const card = page.locator('.ai-model-card').first()
  await expect(card.locator('.ai-model-health')).toContainText(localText('2026-11-09T01:40:00.000Z'))

  // 点连通性测试后，健康数据与最近测试时间要立刻更新
  await card.getByRole('button', { name: '连通性测试' }).click()
  await expect(card.locator('.ai-model-health')).toContainText(localText('2026-11-09T13:14:00.000Z'))
  await expect(card.locator('.ai-model-health')).toContainText('1.1 秒')

  // 统计面板里的「模型健康」也要跟着刷新
  const healthBreak = page.locator('.ai-stats-break').nth(2)
  await expect(healthBreak).toContainText(localText('2026-11-09T13:14:00.000Z'))
})
