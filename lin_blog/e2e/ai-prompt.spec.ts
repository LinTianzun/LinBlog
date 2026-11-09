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
  await expect(groups).toHaveCount(3)
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

  // 所属功能必须用中文下拉，不再直接暴露 featureKey
  const featureSelect = modal.locator('select')
  await expect(featureSelect).toBeVisible()
  await expect(featureSelect).toContainText('自由创作')
  await expect(featureSelect).not.toContainText('freeform')

  await modal.locator('input[type="text"]').first().fill('我的写作风格')
  await modal.locator('textarea').fill('请用更口语化的语气写简介：{{title}}')
  await modal.getByRole('button', { name: '确认保存' }).click()

  // 新建的模板出现在列表里，并可被选用
  await expect(page.locator('.ai-prompt-row').filter({ hasText: '我的写作风格' })).toBeVisible()
  await expect(page.locator('.ai-prompt-row').filter({ hasText: '我的写作风格' }).getByText('自定义')).toHaveCount(1)
})

test('提示词模板页可在右侧试跑并选用模板', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-preview')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.ai-prompt-preview')).toContainText('自由创作 · 草稿')

  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(page.locator('.ai-prompt-result')).toContainText('这是提示词试跑结果。')

  await page.locator('.ai-prompt-row').first().getByRole('button', { name: '试跑' }).click()
  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(page.locator('.ai-prompt-preview')).toContainText('写作建议')
  await expect(page.locator('.ai-prompt-preview').getByRole('button', { name: '选用此套提示词' })).toBeVisible()
})

test('提示词模板页不触发浏览器滚动，试跑前后布局不跳动', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-preview')).toBeVisible({ timeout: 30_000 })

  // 整页不产生浏览器滚动，内容由左右两栏各自内部滚动
  const pageScroll = await page.evaluate(() =>
    document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(pageScroll).toBe(0)

  // 结果区一开始就在页面上，且不因试跑完成而改变位置
  const panel = page.locator('.ai-prompt-result-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('还没有试跑结果')
  const before = await panel.boundingBox()

  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(panel).toContainText('这是提示词试跑结果。')
  const after = await panel.boundingBox()

  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0)

  // 试跑后依然不产生浏览器滚动
  const scrollAfter = await page.evaluate(() =>
    document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(scrollAfter).toBe(0)
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
