import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const NOTE_ID = 21
const ARTICLE_ID = 921
const ARTICLE_TITLE = '从一篇花园笔记长出来的文章'
const NOTE_TITLE = '数字花园里的慢笔记'
const ARTICLE_LINK = `/portal/articles?open=${ARTICLE_ID}`
const SNIPPET = `## 延伸阅读\n\n- [${ARTICLE_TITLE}](${ARTICLE_LINK})`

function notePayload(content: string) {
  return {
    id: NOTE_ID,
    title: NOTE_TITLE,
    slug: 'slow-garden-note',
    content,
    excerpt: '一条还没有回链的花园笔记。',
    state: 'published',
    publishedAt: '2026-11-20T08:00:00.000Z',
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-20T08:00:00.000Z',
    outgoingLinks: 0,
    incomingLinks: 0,
  }
}

async function installNoteMock(
  page: Page,
  options: { tidyLinked?: boolean; upgraded?: boolean; noteContent?: string } = {},
): Promise<{ putBodies: string[] }> {
  const putBodies: string[] = []
  let content = options.noteContent ?? '# 验证\n\n这条笔记还没有指向文章的链接。\n'

  await page.route(url => url.pathname === '/api/note' || url.pathname.startsWith('/api/note/'), async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const fulfill = (data: unknown) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    })

    if (method === 'GET' && url.pathname === '/api/note/tidy') {
      const item = {
        id: NOTE_ID,
        title: NOTE_TITLE,
        excerpt: '一条还没有回链的花园笔记。',
        tags: ['花园'],
        outgoingLinks: 0,
        incomingLinks: 0,
        updatedAt: '2026-11-20T08:00:00.000Z',
        missingLinks: [],
        suggestions: [],
        upgradedArticle: options.upgraded === false
          ? null
          : {
              id: ARTICLE_ID,
              title: ARTICLE_TITLE,
              state: 'published',
              publishedAt: '2026-11-21T08:00:00.000Z',
            },
        articleLinked: Boolean(options.tidyLinked),
      }
      await fulfill({
        orphans: [item],
        brokenLinks: [],
        summary: { published: 1, orphan: 1, broken: 0 },
      })
      return
    }

    if (method === 'GET' && url.pathname === '/api/note/summary') {
      await fulfill({ all: 1, draft: 0, published: 1 })
      return
    }

    if (method === 'GET' && url.pathname === '/api/note') {
      await fulfill({
        list: [notePayload(content)],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPage: 1,
      })
      return
    }

    if (method === 'GET' && url.pathname === `/api/note/${NOTE_ID}`) {
      await fulfill(notePayload(content))
      return
    }

    if (method === 'PUT' && url.pathname === `/api/note/${NOTE_ID}`) {
      const body = request.postData() || ''
      putBodies.push(body)
      const parsed = JSON.parse(body || '{}') as { content?: string }
      if (typeof parsed.content === 'string') content = parsed.content
      await fulfill({ found: true, state: 'published' })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 404, message: 'not found' }),
    })
  })

  return { putBodies }
}

async function seedNoteSession(page: Page): Promise<void> {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll', 'article.publish'],
  })
}

test('待整理笔记可以回到花园补上文章链接', async ({ page }) => {
  await seedNoteSession(page)
  await installApiMock(page)
  const noteMock = await installNoteMock(page)

  await page.goto('/notes/tidy')
  await expect(page.getByRole('heading', { name: '待整理笔记' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '回笔记补链接' })).toBeVisible()
  await page.getByRole('button', { name: '回笔记补链接' }).click()
  await expect(page).toHaveURL(new RegExp(`/notes\\?note=${NOTE_ID}.*linkArticle=${ARTICLE_ID}`))
  await expect(page.locator('.note-banner.is-link')).toContainText(ARTICLE_TITLE)

  await page.getByRole('button', { name: '补到笔记末尾' }).click()
  await expect(page.locator('.note-banner.is-link')).not.toContainText('补到笔记末尾')
  await expect(page.locator('.note-textarea')).toHaveValue(new RegExp(ARTICLE_LINK.replace('?', '\\?')))
  expect(noteMock.putBodies).toHaveLength(1)
  expect(noteMock.putBodies[0]).toContain(ARTICLE_LINK)
})

test('已回链的待整理笔记直接显示文章入口', async ({ page }) => {
  await seedNoteSession(page)
  await installApiMock(page)
  await installNoteMock(page, { tidyLinked: true })

  await page.goto('/notes/tidy')
  await expect(page.getByRole('heading', { name: '待整理笔记' })).toBeVisible({ timeout: 30_000 })
  const articleEntry = page.getByRole('link', { name: '链接到文章' })
  await expect(articleEntry).toBeVisible()
  await expect(articleEntry).toHaveAttribute('href', ARTICLE_LINK)
  await expect(page.getByRole('button', { name: '回笔记补链接' })).toHaveCount(0)
})

test('花园页识别正文里已有的文章链接，不再重复提示补链', async ({ page }) => {
  await seedNoteSession(page)
  await installApiMock(page)
  await installNoteMock(page, {
    noteContent: `# 验证\n\n已经写过延伸阅读。\n\n${SNIPPET}\n`,
  })

  const query = new URLSearchParams({
    note: String(NOTE_ID),
    linkArticle: String(ARTICLE_ID),
    articleTitle: ARTICLE_TITLE,
    snippet: SNIPPET,
  })
  await page.goto(`/notes?${query.toString()}`)

  const banner = page.locator('.note-banner.is-link')
  await expect(banner).toContainText(ARTICLE_TITLE)
  await expect(banner.getByRole('button', { name: '补到笔记末尾' })).toHaveCount(0)
  await expect(banner.getByRole('button', { name: '复制链接文案' })).toBeVisible()
})

test('编辑已有文章时不会继承本机升级草稿的来源笔记', async ({ page }) => {
  await seedNoteSession(page)
  const state = await installApiMock(page)
  state.articles.push({
    ...state.articles[0],
    id: 1402,
    title: '一篇普通的草稿',
    state: 'draft',
  })
  const noteMock = await installNoteMock(page)
  await page.addInitScript(() => {
    localStorage.setItem('linblog.local-draft.article-new', JSON.stringify({
      title: '升级草稿停在本机',
      content: '<p>还没打开过的新文章草稿。</p>',
      subsetId: null,
      label: '',
      introduce: '',
      cover: '',
      sourceNoteId: 21,
      savedAt: '2026-11-22T08:00:00.000Z',
    }))
    localStorage.setItem('linblog.local-draft.article', JSON.stringify({
      title: '升级草稿停在本机',
      content: '<p>还没打开过的新文章草稿。</p>',
      subsetId: null,
      label: '',
      introduce: '',
      cover: '',
      sourceNoteId: 21,
      savedAt: new Date().toISOString(),
    }))
  })

  await page.goto('/editarticle/1402')
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  // 编辑已有文章时既不会恢复升级稿，也不会露出「丢弃本机草稿」去误删它
  await expect(page.getByRole('button', { name: '丢弃本机草稿' })).toHaveCount(0)
  const publishRequest = page.waitForRequest(request =>
    request.method() === 'PATCH'
    && request.url().includes('/api/article/1402/status')
  )
  await page.getByRole('button', { name: '发布', exact: true }).click()

  // 路径本身无关紧要：关键是不能因为本机残留的升级草稿被带回 /notes
  await publishRequest
  await expect(page).not.toHaveURL(/\/notes/)
  await expect(page.locator('.edit-article-topbar-title')).toContainText('编辑博客文章')
  await expect(page.getByText('文章已发布', { exact: true })).toBeVisible()
})

test('从待整理页升级成长文并发布后，会回到花园提示补链', async ({ page }) => {
  await seedNoteSession(page)
  const state = await installApiMock(page)
  state.articles[0].state = 'draft'
  const noteMock = await installNoteMock(page, { upgraded: false })
  const createdBodies: Array<Record<string, unknown>> = []
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/article') {
      createdBodies.push(JSON.parse(request.postData() || '{}') as Record<string, unknown>)
    }
  })
  // 升级稿会带来源笔记；用例在恢复弹窗里确认恢复
  const dialogMessages: string[] = []
  page.on('dialog', dialog => {
    dialogMessages.push(dialog.message())
    void dialog.accept()
  })

  await page.goto('/notes/tidy')
  await expect(page.getByRole('heading', { name: '待整理笔记' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '升级成长文' }).click()

  await expect(page).toHaveURL(/\/editarticle(\?|$)/)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => dialogMessages.join('\n')).toContain('暂存在本机的未发布草稿')
  await expect(page.locator('.forms-title')).toHaveValue(NOTE_TITLE)

  await page.getByRole('button', { name: '发布', exact: true }).click()

  const publishRequest = page.waitForRequest(request =>
    request.method() === 'PATCH'
    && /\/api\/article\/\d+\/status$/.test(new URL(request.url()).pathname)
  )
  await publishRequest

  expect(createdBodies).toHaveLength(1)
  expect(createdBodies[0].sourceNoteId).toBe(NOTE_ID)
  await expect(page).toHaveURL(new RegExp(`/notes\\?note=${NOTE_ID}.*linkArticle=\\d+`))
  await expect(page.locator('.note-banner.is-link')).toContainText(NOTE_TITLE)
  await expect(page.locator('.note-banner.is-link')).toContainText('补到笔记末尾')
  // 只是提示补链，不会偷偷改写笔记正文
  expect(noteMock.putBodies).toHaveLength(0)
  // 发布后草稿与升级来源都要清干净，避免下次打开误判
  const stored = await page.evaluate(() => ({
    draft: localStorage.getItem('linblog.local-draft.article-new'),
    intent: localStorage.getItem('linblog.note-upgrade'),
  }))
  expect(stored.draft).toBeNull()
  expect(stored.intent).toBeNull()
})

test('放弃恢复升级稿后直接写新文章，发布仍带着来源笔记并回链', async ({ page }) => {
  await seedNoteSession(page)
  await installApiMock(page)
  await installNoteMock(page, { upgraded: false })
  const createdBodies: Array<Record<string, unknown>> = []
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/article') {
      createdBodies.push(JSON.parse(request.postData() || '{}') as Record<string, unknown>)
    }
  })
  // 升级稿在本机残留，但作者选择不恢复，改在空白页重新写
  page.on('dialog', dialog => void dialog.dismiss())
  await page.addInitScript(() => {
    localStorage.setItem('linblog.local-draft.article-new', JSON.stringify({
      title: '不想恢复的旧升级稿',
      content: '<p>旧稿。</p>',
      subsetId: null,
      label: '',
      introduce: '',
      cover: '',
      sourceNoteId: 21,
      savedAt: '2026-11-22T08:00:00.000Z',
    }))
  })

  await page.goto('/editarticle')
  const title = page.locator('.forms-title')
  await expect(title).toHaveValue('', { timeout: 30_000 })
  await title.fill('放弃旧稿后重写的新文章')
  await page.locator('.w-e-text-container').click()
  await page.keyboard.type('重新写的正文。')

  const publishRequest = page.waitForRequest(request =>
    request.method() === 'PATCH'
    && /\/api\/article\/\d+\/status$/.test(new URL(request.url()).pathname)
  )
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await publishRequest

  expect(createdBodies).toHaveLength(1)
  expect(createdBodies[0].sourceNoteId).toBe(NOTE_ID)
  await expect(page).toHaveURL(new RegExp(`/notes\\?note=${NOTE_ID}.*linkArticle=\\d+`))
  // 提示条展示的是刚发布的文章标题
  await expect(page.locator('.note-banner.is-link')).toContainText('放弃旧稿后重写的新文章')
})
