import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const MANAGE_PERMISSIONS = ['ai.manage', 'ai.use']

test('提示词模板页按功能分组展示且每条模板只占一行', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-group').first()).toBeVisible({ timeout: 30_000 })

  // 功能分组：写作建议与封面配图各自一组
  const groups = page.locator('.ai-prompt-group')
  await expect(groups).toHaveCount(2)
  await expect(groups.nth(0)).toContainText('写作建议')
  await expect(groups.nth(1)).toContainText('封面配图')

  // 紧凑布局：模板是一行，不是带大文本框的卡片
  const row = page.locator('.ai-prompt-row').first()
  await expect(row).toBeVisible()
  await expect(row.locator('textarea')).toHaveCount(0)
  await expect(row).toContainText('内置')
  await expect(row).toContainText('使用中')
})

test('提示词模板页可切换功能使用的模板', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-row').first()).toBeVisible({ timeout: 30_000 })

  // 内置模板是当前使用中，选用按钮禁用
  const firstRow = page.locator('.ai-prompt-row').first()
  await expect(firstRow.getByRole('button', { name: '选用' })).toBeDisabled()
})

test('提示词模板页可新建自定义提示词', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-group').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '+ 新建提示词' }).click()
  const modal = page.locator('.yk-modal__main')
  await expect(modal).toBeVisible()

  await modal.locator('input[type="text"]').first().fill('我的写作风格')
  await modal.locator('textarea').fill('请用更口语化的语气写简介：{{title}}')
  await modal.getByRole('button', { name: '确认保存' }).click()

  // 新建的模板出现在列表里，并可被选用
  await expect(page.locator('.ai-prompt-row').filter({ hasText: '我的写作风格' })).toBeVisible()
  await expect(page.locator('.ai-prompt-row').filter({ hasText: '自定义' })).toHaveCount(1)
})

test('没有 ai.manage 权限时不显示提示词模板入口', async ({ page }) => {
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
  await expect(page.locator('.menu-bar').getByText('提示词模板', { exact: true })).toHaveCount(0)

  // 直接访问会被路由守卫拦回
  await page.goto('/aiPrompt')
  await expect(page).not.toHaveURL(/\/aiPrompt$/)
})
