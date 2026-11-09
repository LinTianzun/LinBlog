import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const MANAGE_PERMISSIONS = ['ai.manage', 'ai.use']

// 与服务端内置模板一致的 10 个功能，用于验证分组与布局
const BUILTIN_FEATURES = [
  { key: 'suggest', name: '写作建议' },
  { key: 'writing', name: '写作辅助' },
  { key: 'cover', name: '封面配图' },
  { key: 'gallery', name: '图库策展' },
  { key: 'search', name: '语义搜索' },
  { key: 'message', name: '私信拟回复' },
  { key: 'operations', name: '运营周报' },
  { key: 'report-review', name: '举报辅助' },
  { key: 'ask', name: '门户问答' },
  { key: 'freeform', name: '自由创作' },
]

const mockAllBuiltinPrompts = async (page: import('@playwright/test').Page) => {
  await page.route(url => url.pathname === '/api/ai/prompts', async (route) => {
    const list = BUILTIN_FEATURES.map((feature, index) => ({
      id: index + 1,
      key: feature.key,
      featureKey: feature.key,
      name: feature.name,
      description: `${feature.name}的说明`,
      variables: '{{input}}',
      content: `请按「${feature.name}」的要求输出：{{input}}`,
      enabled: true,
      isDefault: true,
      customized: false,
      updatedAt: null,
    }))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: { list, bindings: {} } }),
    })
  })
}

test('提示词模板页按功能分组展示且每条模板只占一行', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)
  await mockAllBuiltinPrompts(page)

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-group').first()).toBeVisible({ timeout: 30_000 })

  // 功能分组：写作建议与封面配图各自一组
  const groups = page.locator('.ai-prompt-group')
  await expect(groups).toHaveCount(10)
  await expect(groups.nth(0)).toContainText('写作建议')
  await expect(groups.nth(1)).toContainText('写作辅助')
  await expect(groups.nth(2)).toContainText('封面配图')

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

test('每个功能分组都展示自己的提示词行，右侧整块留给试跑结果', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)
  await mockAllBuiltinPrompts(page)
  await page.setViewportSize({ width: 2000, height: 1080 })

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-group').first()).toBeVisible({ timeout: 30_000 })

  // 每个功能分组下面都要有自己的提示词行，不能被压扁裁掉
  const groups = page.locator('.ai-prompt-group')
  const groupCount = await groups.count()
  expect(groupCount).toBe(10)
  for (let index = 0; index < groupCount; index += 1) {
    const group = groups.nth(index)
    await expect(group.locator('.ai-prompt-row').first()).toBeVisible()
  }

  // 右侧整块区域是试跑结果区，且宽度要明显大于左侧输入区
  const result = page.locator('.ai-prompt-result-panel')
  await expect(result).toBeVisible()
  const resultBox = await result.boundingBox()
  const formBox = await page.locator('.ai-prompt-preview-form').boundingBox()
  expect(resultBox?.width ?? 0).toBeGreaterThan(formBox?.width ?? 0)

  // 右栏不应在页面右侧留下大片空白：结果区要吃到右栏右边界
  const previewBox = await page.locator('.ai-prompt-preview').boundingBox()
  // 结果区位于右栏内部、靠右排布
  expect(resultBox?.x ?? 0).toBeGreaterThan(previewBox?.x ?? 0)
  expect(Math.abs((resultBox?.x ?? 0) + (resultBox?.width ?? 0) - ((previewBox?.x ?? 0) + (previewBox?.width ?? 0)))).toBeLessThan(80)
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
