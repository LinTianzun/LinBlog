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
  const modal = page.locator('.yk-modal__main:visible').last()
  await expect(modal).toBeVisible()

  // 所属功能必须用中文下拉，不再直接暴露 featureKey
  const featureSelect = modal.locator('.select-field-trigger')
  await expect(featureSelect).toBeVisible()
  await expect(featureSelect).toContainText('写作建议')
  await expect(featureSelect).not.toContainText('freeform')

  // 展开后能看到全部中文功能名
  await featureSelect.click()
  const featureMenu = modal.locator('.select-field-menu')
  await expect(featureMenu).toBeVisible()
  await expect(featureMenu).toContainText('自由创作')
  await expect(featureMenu).not.toContainText('freeform')
  await featureMenu.getByText('自由创作').click()
  await expect(featureSelect).toContainText('自由创作')
  // 选完选项后下拉必须立即收起
  await expect(featureMenu).toBeHidden()

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

test('AI 优化只生成候选，作者确认后才应用到提示词输入框', async ({ page }) => {
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

  const editor = page.locator('.ai-prompt-preview-form textarea.ai-prompt-editor').first()
  const originalContent = await editor.inputValue()

  await page.locator('.ai-prompt-assist-input').fill('更简洁，强调输出格式')
  await page.getByRole('button', { name: 'AI 优化' }).click()

  const candidate = page.locator('.ai-prompt-result.is-candidate')
  await expect(candidate).toBeVisible()
  await expect(candidate).toContainText('已增强输出约束')
  await expect(candidate.locator('.ai-prompt-candidate-content'))
    .toHaveText('请用更简洁的方式输出：{{title}}')
  // 候选只展示，未确认前不能偷偷改掉输入框
  await expect(editor).toHaveValue(originalContent)

  await candidate.getByRole('button', { name: '应用到输入框' }).click()
  await expect(editor).toHaveValue('请用更简洁的方式输出：{{title}}')
  await expect(page.locator('.ai-banner.is-success')).toContainText('候选提示词已应用')
})

test('AI 帮我写可生成候选，忽略后不改动输入框', async ({ page }) => {
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

  const editor = page.locator('.ai-prompt-preview-form textarea.ai-prompt-editor').first()
  const originalContent = await editor.inputValue()

  await page.locator('.ai-prompt-assist-input').fill('写一段适合自由创作的模板')
  await page.getByRole('button', { name: 'AI 帮我写' }).click()

  const candidate = page.locator('.ai-prompt-result.is-candidate')
  await expect(candidate).toBeVisible()
  await expect(candidate).toContainText('为自由创作生成候选模板')
  await expect(candidate.locator('.ai-prompt-candidate-content'))
    .toHaveText('请用友好口吻回答：{{input}}')

  await candidate.getByRole('button', { name: '忽略' }).click()
  await expect(page.locator('.ai-prompt-result.is-candidate')).toHaveCount(0)
  await expect(editor).toHaveValue(originalContent)
})

test('AI 优化进行中显示进度，完成后展示候选', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)
  // 后注册的路由优先，延迟响应以便观察加载态
  await page.route(url => url.pathname === '/api/ai/prompts/assist', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 800))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: '提示词候选已生成',
        data: {
          content: '延迟返回的候选提示词',
          summary: '用于验证进度展示',
          degraded: false,
          modelName: 'Mock GLM',
        },
      }),
    })
  })

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-preview')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'AI 优化' }).click()
  const loading = page.locator('.ai-prompt-result.is-loading')
  await expect(loading).toBeVisible()
  await expect(loading).toContainText('正在生成候选提示词')
  await expect(loading.locator('.ai-prompt-progress')).toBeVisible()

  await expect(page.locator('.ai-prompt-result.is-candidate')).toBeVisible()
  await expect(page.locator('.ai-prompt-result.is-candidate')).toContainText('延迟返回的候选提示词')
  await expect(page.locator('.ai-prompt-result.is-loading')).toHaveCount(0)
})

test('提示词试跑失败时展示模型错误，不残留加载态', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: MANAGE_PERMISSIONS,
  })
  await installApiMock(page)
  // 模拟模型连接失败：先进入加载态，再返回可读错误
  await page.route(url => url.pathname === '/api/ai/prompts/preview', async (route) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 503,
        message: '模型连接超时，请稍后重试',
        data: null,
      }),
    })
  })

  await page.goto('/aiPrompt')
  await expect(page.locator('.ai-prompt-preview')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(page.locator('.ai-prompt-result.is-loading')).toBeVisible()
  await expect(page.locator('.ai-banner.is-error')).toContainText('模型连接超时，请稍后重试')
  await expect(page.locator('.ai-prompt-result.is-loading')).toHaveCount(0)
  await expect(page.locator('.ai-prompt-result.is-empty')).toBeVisible()
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

test('试跑区可选择生成文字或生成图片', async ({ page }) => {
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

  // 默认生成文字
  const modeGroup = page.locator('.ai-prompt-mode')
  await expect(modeGroup).toBeVisible()
  await expect(modeGroup.getByRole('radio', { name: '生成文字' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(page.locator('.ai-prompt-result.is-text')).toContainText('这是提示词试跑结果。')

  // 切到生成图片后，结果区应换成图片
  await modeGroup.getByRole('radio', { name: '生成图片' }).click()
  await expect(modeGroup.getByRole('radio', { name: '生成图片' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: '开始试跑' }).click()
  await expect(page.locator('.ai-prompt-result img')).toBeVisible()
  await page.getByRole('button', { name: '存入本地文件' }).click()
  await expect(page.locator('.ai-banner.is-success')).toContainText('/api/uploads/ai-preview.png')
})

test('所属功能下拉展示中文名并可切换', async ({ page }) => {
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

  const trigger = page.locator('.ai-prompt-preview .select-field-trigger')
  await expect(trigger).toContainText('自由创作')
  await trigger.click()

  // 展开后是中文功能名，不出现英文 featureKey
  const menu = page.locator('.ai-prompt-preview .select-field-menu')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('封面配图')
  await expect(menu).not.toContainText('freeform')

  // 点击外部也应收起
  await page.locator('.ai-prompt-preview-head').click()
  await expect(menu).toBeHidden()
  await trigger.click()

  await menu.getByText('封面配图').click()
  await expect(trigger).toContainText('封面配图')
  await expect(menu).toBeHidden()
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
