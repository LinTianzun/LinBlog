import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const MANAGE_PERMISSIONS = ['ai.manage', 'ai.use']

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
