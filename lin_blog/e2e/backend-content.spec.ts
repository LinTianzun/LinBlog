import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'

const ADMIN_PERMISSIONS = [
  'article.viewAll',
  'article.create',
  'article.manageOwn',
  'article.manageAll',
  'article.publish',
  'gallery.viewAll',
  'gallery.manageAll',
  'diary.viewAll',
  'diary.create',
  'diary.manageAll',
]

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ADMIN_PERMISSIONS,
  })
}

test('文章列表可撤回发布并删除条目', async ({ page }) => {
  await loginAsAdmin(page)
  const state = await installApiMock(page)

  await page.goto('/article')

  const item = page.locator('.article-item').first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await expect(item.locator('.article-item-title')).toHaveText(article.title)

  // 已发布文章应提供「撤回为草稿」，点击后发出 PATCH /api/article/:id/status
  const statusRequest = page.waitForRequest(req =>
    req.method() === 'PATCH' && /\/api\/article\/\d+\/status$/.test(new URL(req.url()).pathname)
  )
  await item.locator('.icon-revoke-outline').click()

  const request = await statusRequest
  const payload = request.postDataJSON() as { state?: string }
  expect(payload.state).toBe('draft')

  // 删除走 yk-popconfirm，确认后发出 DELETE
  const deleteRequest = page.waitForRequest(req =>
    req.method() === 'DELETE' && /\/api\/article\/\d+$/.test(new URL(req.url()).pathname)
  )
  await item.locator('.article-item-datas-icons .icon-delete-outline').click()
  // yk-popconfirm 的面板渲染在 tooltip 里，必须限定在条目内的那个 popconfirm
  await item.locator('.yk-popconfirm').getByRole('button', { name: '确认' }).click()

  const deleteCall = await deleteRequest
  expect(new URL(deleteCall.url()).pathname).toBe(`/api/article/${article.id}`)
  expect(state.articles.some(item => item.id === article.id)).toBe(false)
})

test('文章列表按关键词搜索会带上 keyword 参数', async ({ page }) => {
  await loginAsAdmin(page)
  await installApiMock(page)

  await page.goto('/article')
  await expect(page.locator('.article-item').first()).toBeVisible({ timeout: 30_000 })

  const listRequest = page.waitForRequest(req => {
    const url = new URL(req.url())
    return url.pathname === '/api/article'
      && url.searchParams.get('classify') === 'article'
      && url.searchParams.get('keyword') === '慢速河流'
  })

  await page.locator('.top-title input').first().fill('慢速河流')
  await page.locator('.top-title input').first().press('Enter')

  const request = await listRequest
  const keyword = new URL(request.url()).searchParams.get('keyword')
  expect(keyword).toBe('慢速河流')

  // 命中标题的条目仍应展示；未命中时应显示空状态
  await expect(page.locator('.article-item').first()).toBeVisible()
})

test('摄影图库列表渲染条目并进入编辑页', async ({ page }) => {
  await loginAsAdmin(page)
  await installApiMock(page)

  const listRequest = page.waitForRequest(req => {
    const url = new URL(req.url())
    return url.pathname === '/api/article' && url.searchParams.get('classify') === 'image'
  })

  await page.goto('/gallery')

  const request = await listRequest
  expect(new URL(request.url()).searchParams.get('classify')).toBe('image')

  const item = page.locator('.gallery-item').first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await expect(item.locator('.gallery-item-title')).toHaveText('城市夜色练习')

  // 编辑按钮应跳到图库编辑页
  await item.locator('.icon-fill-outline').click()
  await page.waitForURL('**/editgallery**')
})

test('随笔列表可新建与删除条目', async ({ page }) => {
  await loginAsAdmin(page)
  const state = await installApiMock(page)

  await page.goto('/diary')

  const item = page.locator('.diary-item').first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await expect(item.locator('.diary-item-top-title')).toHaveText('雨天的旧书店')

  // 新建随笔：填标题与正文后提交
  const createRequest = page.waitForRequest(req =>
    req.method() === 'POST' && new URL(req.url()).pathname === '/api/diary'
  )
  await page.locator('.diary-editor-top-title').fill('新写的一篇随笔')
  await page.locator('.diary-editor-top-content textarea, textarea.diary-editor-top-content')
    .first()
    .fill('正文内容')
  await page.getByRole('button', { name: '新建笔记' }).click()

  const createCall = await createRequest
  const createPayload = createCall.postDataJSON() as { title?: string; content?: string }
  expect(createPayload.title).toBe('新写的一篇随笔')
  expect(createPayload.content).toBe('正文内容')
  await expect
    .poll(() => state.diaries.some(item => item.title === '新写的一篇随笔'))
    .toBe(true)

  // 删除随笔：走 ConfirmPopover，确认后发出 DELETE
  const deleteRequest = page.waitForRequest(req =>
    req.method() === 'DELETE' && /^\/api\/diary\/\d+$/.test(new URL(req.url()).pathname)
  )
  // 新建的随笔排在最前，按标题锁定要删除的那条，避免依赖列表顺序
  const target = page.locator('.diary-item').filter({ hasText: '雨天的旧书店' }).first()
  // 操作图标默认隐藏（hover 才出现）；编辑与删除共用 .diary-item-top-delete，
  // 按图标 class 区分。
  await target.hover()
  await target.locator('.icon-delete-outline').click()
  await page.locator('.confirm-popover-btn.is-danger').click()

  const deleteCall = await deleteRequest
  expect(new URL(deleteCall.url()).pathname).toBe('/api/diary/1401')
  await expect.poll(() => state.diaries.some(item => item.id === 1401)).toBe(false)
})
