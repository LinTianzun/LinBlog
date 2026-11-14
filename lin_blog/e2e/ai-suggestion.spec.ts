import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

test('AI 建议只在作者确认后填充简介与标签', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('Vue 3 组合式 API 实战')
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('本文介绍组合式 API 的用法。')

  // 生成建议：摘要与标签只展示，不直接写进表单
  await page.getByRole('button', { name: 'AI 建议' }).click()
  const suggestion = page.locator('.forms-ai-suggestion')
  await expect(suggestion).toBeVisible()
  await expect(suggestion).toContainText('AI 建议的简介内容')
  await expect(page.locator('.forms-intro textarea')).toHaveValue('')
  await expect(page.locator('.forms-tags .tag')).toHaveCount(0)

  // 作者确认后才填充
  await page.getByRole('button', { name: '采用建议' }).click()
  await expect(page.locator('.forms-intro textarea')).toHaveValue('AI 建议的简介内容')
  await expect(page.locator('.forms-tags .tag')).toHaveCount(2)
  await expect(page.locator('.forms-tags')).toContainText('Vue')
  await expect(page.locator('.forms-ai-suggestion')).toHaveCount(0)
})

test('忽略 AI 建议不会改动表单内容', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('标题')
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('正文内容')

  await page.getByRole('button', { name: 'AI 建议' }).click()
  await expect(page.locator('.forms-ai-suggestion')).toBeVisible()
  await page.getByRole('button', { name: '忽略' }).click()

  await expect(page.locator('.forms-ai-suggestion')).toHaveCount(0)
  await expect(page.locator('.forms-intro textarea')).toHaveValue('')
  await expect(page.locator('.forms-tags .tag')).toHaveCount(0)
})

test('AI 润色在作者确认后替换选中正文', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('需要润色的原始正文')
  await page.keyboard.press('Control+A')

  await page.getByRole('button', { name: 'AI 润色' }).click()
  const writing = page.locator('.editor-ai-result')
  await expect(writing).toBeVisible()
  await expect(writing).toContainText('AI 润色后的候选内容。')
  await expect(page.locator('.w-e-text-container')).toContainText('需要润色的原始正文')

  await writing.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.w-e-text-container')).toContainText('AI 润色后的候选内容。')
  await expect(page.locator('.w-e-text-container')).not.toContainText('需要润色的原始正文')
  await expect(page.locator('.editor-ai-result')).toHaveCount(0)
})

test('忽略 AI 续写不会改动正文', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('已有正文内容')

  await page.getByRole('button', { name: 'AI 续写' }).click()
  const writing = page.locator('.editor-ai-result')
  await expect(writing).toBeVisible()
  await expect(writing).toContainText('AI 续写的候选内容。')

  await writing.getByRole('button', { name: '忽略' }).click()
  await expect(page.locator('.editor-ai-result')).toHaveCount(0)
  await expect(page.locator('.w-e-text-container')).toContainText('已有正文内容')
  await expect(page.locator('.w-e-text-container')).not.toContainText('AI 续写的候选内容。')
})

test('正文没有待补全图片时提示作者先插入图片', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'AI 补全图片描述' }).click()
  await expect(page.locator('.editor-ai-error')).toContainText('正文里没有待补全描述的图片')
})

test('AI 封面在作者确认后写入封面字段', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('封面测试文章')
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('正文内容用于生成封面')

  await page.getByRole('button', { name: 'AI 生成封面' }).click()
  const coverSuggestion = page.locator('.image-source-preview')
  await expect(coverSuggestion).toBeVisible()
  await expect(coverSuggestion.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)

  await coverSuggestion.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.image-source-preview')).toHaveCount(0)
  await expect(page.locator('.forms-cover img').first()).toHaveAttribute('src', '/api/uploads/ai-e2e-cover.png')
})

test('忽略 AI 封面不会改动封面', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('封面忽略测试')
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('正文内容')

  await page.getByRole('button', { name: 'AI 生成封面' }).click()
  const coverSuggestion = page.locator('.image-source-preview')
  await expect(coverSuggestion).toBeVisible()

  await coverSuggestion.getByRole('button', { name: '忽略' }).click()
  await expect(page.locator('.image-source-preview')).toHaveCount(0)
  await expect(page.locator('.forms-cover img')).toHaveCount(0)
})

test('随笔 AI 配图在作者确认后加入配图列表', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['diary.create', 'diary.manageAll', 'diary.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/diary')
  await expect(page.locator('.diary-editor-top-title')).toBeVisible({ timeout: 30_000 })
  await page.locator('.diary-editor-top-title').fill('随笔配图测试')
  await page.locator('.diary-editor-top-content textarea, textarea.diary-editor-top-content')
    .first()
    .fill('一段随笔正文')

  await page.getByRole('button', { name: 'AI 生成配图' }).click()
  const preview = page.locator('.image-source-preview')
  await expect(preview).toBeVisible()

  await preview.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.image-source-preview')).toHaveCount(0)
  await expect(page.locator('.diary-editor-top-existing img')).toHaveCount(1)
  await expect(page.locator('.diary-editor-top-existing img').first())
    .toHaveAttribute('src', '/api/uploads/ai-e2e-cover.png')
})

test('随笔配图区支持从素材库多选、设封面和删除', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['diary.create', 'diary.manageAll', 'diary.viewAll', 'ai.use', 'file.view'],
  })
  await installApiMock(page)

  await page.goto('/diary')
  await expect(page.locator('.diary-editor-top-title')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.diary-photo-empty')).toContainText('还没有配图')

  await page.getByRole('button', { name: '素材库' }).click()
  const picker = page.locator('.yk-modal__main:visible').last()
  await expect(picker.locator('.media-picker-item')).toHaveCount(2)
  await picker.locator('.media-picker-item').nth(0).click()
  await picker.locator('.media-picker-item').nth(1).click()
  await picker.getByRole('button', { name: '确定' }).click()

  const photos = page.locator('.diary-editor-top-photo')
  await expect(photos).toHaveCount(2)
  await expect(page.locator('.diary-photo-count')).toContainText('2 / 6')
  await expect(photos.first().locator('img')).toHaveAttribute('src', '/api/file/501/raw')

  // 第二张可一键设为封面，顺序立即变化
  await photos.nth(1).getByTitle('设为封面').click()
  await expect(photos.first().locator('img')).toHaveAttribute('src', '/api/file/502/raw')

  // 删除按钮和缩略图在同一个卡片里，不会误删别的图片
  await photos.first().getByTitle('删除这张配图').click()
  await expect(photos).toHaveCount(1)
  await expect(photos.first().locator('img')).toHaveAttribute('src', '/api/file/501/raw')
})

test('随笔 AI 描述配图采用后追加到正文', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['diary.create', 'diary.manageAll', 'diary.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/diary')
  await expect(page.locator('.diary-editor-top-title')).toBeVisible({ timeout: 30_000 })
  await page.locator('.diary-editor-top-title').fill('深夜书房')

  await page.getByRole('button', { name: 'AI 生成配图' }).click()
  const preview = page.locator('.image-source-preview')
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.diary-editor-top-existing img')).toHaveCount(1)

  const describeButton = page.getByRole('button', { name: 'AI 描述配图' })
  await expect(describeButton).toBeEnabled()
  await describeButton.click()

  const suggestion = page.locator('.diary-editor-ai-result')
  await expect(suggestion).toContainText('AI 批量描述的海岸清晨画面')
  await expect(page.locator('.diary-editor-top-content textarea').first()).toHaveValue('')

  await suggestion.getByRole('button', { name: '采用描述' }).click()
  await expect(page.locator('.diary-editor-top-content textarea').first())
    .toHaveValue('AI 批量描述的海岸清晨画面，潮水与晨雾构成安静的开场。')
  await expect(page.locator('.diary-editor-ai-result')).toHaveCount(0)
})

test('随笔 AI 润色在作者确认后写入编辑器', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['diary.create', 'diary.manageAll', 'diary.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/diary')
  await expect(page.locator('.diary-editor-top-title')).toBeVisible({ timeout: 30_000 })
  await page.locator('.diary-editor-top-title').fill('随笔润色测试')
  await page.locator('.diary-editor-top-content textarea').first()
    .fill('需要润色的随笔正文')

  await page.getByRole('button', { name: 'AI 润色' }).click()
  const writing = page.locator('.diary-editor-ai-result')
  await expect(writing).toBeVisible()
  await expect(writing).toContainText('AI 润色后的候选内容。')
  await expect(page.locator('.diary-editor-top-content textarea').first())
    .toHaveValue('需要润色的随笔正文')

  await writing.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.diary-editor-ai-result')).toHaveCount(0)
  await expect(page.locator('.diary-editor-top-content textarea').first())
    .toHaveValue('AI 润色后的候选内容。')

  // 保存随笔时要把「AI 写作」环节带进白名单字段
  const saveRequest = page.waitForRequest(req =>
    req.method() === 'POST' && new URL(req.url()).pathname === '/api/diary'
  )
  await page.getByRole('button', { name: '新建笔记' }).click()
  const payload = (await saveRequest).postDataJSON() as {
    content?: string
    aiFeatures?: string[]
  }
  expect(payload.content).toBe('AI 润色后的候选内容。')
  expect(payload.aiFeatures).toEqual(['writing'])
})

test('忽略随笔 AI 续写不会改动正文', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['diary.create', 'diary.manageAll', 'diary.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/diary')
  await expect(page.locator('.diary-editor-top-title')).toBeVisible({ timeout: 30_000 })
  await page.locator('.diary-editor-top-content textarea').first()
    .fill('已有的随笔正文')

  await page.getByRole('button', { name: 'AI 续写' }).click()
  const writing = page.locator('.diary-editor-ai-result')
  await expect(writing).toBeVisible()
  await expect(writing).toContainText('AI 续写的候选内容。')

  await writing.getByRole('button', { name: '忽略' }).click()
  await expect(page.locator('.diary-editor-ai-result')).toHaveCount(0)
  await expect(page.locator('.diary-editor-top-content textarea').first())
    .toHaveValue('已有的随笔正文')
})

test('图库 AI 配图在作者确认后加入瀑布流', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['gallery.create', 'gallery.manageAll', 'gallery.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/editgallery')
  await expect(page.locator('.edit_photo-uploader')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('图库配图测试')

  await page.getByRole('button', { name: 'AI 生成配图' }).click()
  const preview = page.locator('.image-source-preview')
  await expect(preview).toBeVisible()

  await preview.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.image-source-preview')).toHaveCount(0)
  await expect(page.locator('.waterfall-item img')).toHaveCount(1)
  await expect(page.locator('.waterfall-item img').first())
    .toHaveAttribute('src', /\/api\/uploads\/ai-e2e-cover\.png/)
})

test('图库 AI 批量描述只展示候选，作者确认后写入简介', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['gallery.create', 'gallery.manageAll', 'gallery.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/editgallery')
  await expect(page.locator('.edit_photo-uploader')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('海岸清晨')

  await page.getByRole('button', { name: 'AI 生成配图' }).click()
  const preview = page.locator('.image-source-preview')
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '采用' }).click()
  await expect(page.locator('.waterfall-item img')).toHaveCount(1)

  const describeButton = page.getByRole('button', { name: 'AI 批量描述' })
  await expect(describeButton).toBeEnabled()
  await describeButton.click()

  const suggestion = page.locator('.forms-ai-suggestion')
  await expect(suggestion).toContainText('AI 批量描述的海岸清晨画面')
  await expect(page.locator('.forms-intro textarea')).toHaveValue('')

  await suggestion.getByRole('button', { name: '采用描述' }).click()
  await expect(page.locator('.forms-intro textarea'))
    .toHaveValue('AI 批量描述的海岸清晨画面，潮水与晨雾构成安静的开场。')
  await expect(page.locator('.forms-ai-suggestion')).toHaveCount(0)
})

test('图库 AI 策展只展示建议，作者逐项确认后填充', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['gallery.create', 'gallery.manageAll', 'gallery.viewAll', 'ai.use'],
  })
  await installApiMock(page)

  await page.goto('/editgallery')
  await expect(page.locator('.edit_photo-uploader')).toBeVisible({ timeout: 30_000 })
  await page.locator('.forms-title').fill('海边照片')
  await page.locator('.forms-intro textarea').fill('一组海边照片')
  await page.locator('.forms-ai-theme input').fill('清晨海岸')

  await page.getByRole('button', { name: 'AI 策展建议' }).click()
  const suggestion = page.locator('.forms-ai-suggestion')
  await expect(suggestion).toBeVisible()
  await expect(suggestion).toContainText('AI 策展的图库简介内容。')
  await expect(page.locator('.forms-title')).toHaveValue('海边照片')
  await expect(page.locator('.forms-intro textarea')).toHaveValue('一组海边照片')
  await expect(page.locator('.forms-tags .tag')).toHaveCount(0)

  await suggestion.getByRole('button', { name: '采用标题' }).first().click()
  await expect(page.locator('.forms-title')).toHaveValue('海岸清晨的慢光')
  await expect(suggestion).toBeVisible()
  // 未采用的候选标题继续保留，作者还能改选
  await expect(suggestion.getByRole('button', { name: '采用标题' })).toHaveCount(2)

  await suggestion.getByRole('button', { name: '采用简介' }).click()
  await expect(page.locator('.forms-intro textarea')).toHaveValue('AI 策展的图库简介内容。')

  await suggestion.getByRole('button', { name: '补充标签' }).click()
  await expect(page.locator('.forms-tags .tag')).toHaveCount(2)
  await expect(page.locator('.forms-tags')).toContainText('海岸')

  await suggestion.getByRole('button', { name: '忽略' }).click()
  await expect(page.locator('.forms-ai-suggestion')).toHaveCount(0)
  await expect(page.locator('.forms-title')).toHaveValue('海岸清晨的慢光')
})

test('没有 ai.use 权限时编辑器不出现 AI 入口', async ({ page }) => {
  await seedSession(page, {
    id: 5,
    isSuperAdmin: false,
    username: '普通用户',
    mail: 'user@example.com',
    permissions: ['article.create', 'article.manageOwn'],
  })
  await installApiMock(page)

  await page.goto('/editarticle')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })

  await expect(page.getByRole('button', { name: 'AI 建议' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'AI 润色' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'AI 生成封面' })).toHaveCount(0)
})
