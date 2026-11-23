import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const NOTE_ID = 21
const ARTICLE_ID = 921

test('待整理推荐出现相关长文，并可打开文章详情', async ({ page, context }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll', 'article.publish'],
  })
  const state = await installApiMock(page)
  state.articles.push({
    ...state.articles[0],
    id: ARTICLE_ID,
    title: '从双链到门户：完整版',
    classify: 'article',
    label: '花园',
    introduce: '把花园里的想法整理成完整长文。',
    content: '<p>这是一篇来自花园笔记的长文。</p>',
    state: 'published',
  })
  await page.route(new RegExp(`/api/public/article/${ARTICLE_ID}$`), async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          id: ARTICLE_ID,
          userId: 1,
          title: '从双链到门户：完整版',
          subsetId: 3,
          subsetName: '花园',
          classify: 'article',
          label: '花园',
          introduce: '把花园里的想法整理成完整长文。',
          cover: null,
          content: '<p>这是一篇来自花园笔记的长文。</p>',
          views: 0,
          likes: 0,
          comments: 0,
          rootComments: 0,
          replyComments: 0,
          state: 'published',
          createdAt: '2026-11-21T08:00:00.000Z',
          updatedAt: '2026-11-21T08:00:00.000Z',
          publishedAt: '2026-11-21T08:00:00.000Z',
        },
      }),
    })
  })
  await page.route(url => url.pathname === '/api/note/tidy', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          orphans: [{
            id: NOTE_ID,
            title: '从双链到门户',
            excerpt: '花园里的想法后来整理成了完整长文。',
            tags: ['花园'],
            outgoingLinks: 0,
            incomingLinks: 0,
            updatedAt: '2026-11-22T08:00:00.000Z',
            missingLinks: [],
            suggestions: [{
              id: ARTICLE_ID,
              title: '从双链到门户：完整版',
              excerpt: '把花园里的想法整理成完整长文。',
              incomingLinks: 0,
              kind: 'article',
              url: `/portal/articles?open=${ARTICLE_ID}`,
              score: 0.42,
              reasons: ['长文', '同标签 · 花园'],
            }],
          }],
          brokenLinks: [],
          summary: { published: 1, orphan: 1, broken: 0 },
        },
      }),
    })
  })

  await page.goto('/notes/tidy')
  const suggestion = page.locator('.tidy-suggest li').filter({ hasText: '从双链到门户：完整版' })
  await expect(suggestion).toBeVisible({ timeout: 30_000 })
  await expect(suggestion).toContainText('长文')
  const articleLink = suggestion.getByRole('link', { name: '打开长文' })
  await expect(articleLink).toHaveAttribute('href', `/portal/articles?open=${ARTICLE_ID}`)

  const popupPromise = context.waitForEvent('page')
  await articleLink.click()
  const popup = await popupPromise
  await expect.poll(() => popup.url()).toContain(`/portal/articles?open=${ARTICLE_ID}`)
  await popup.close()
})
