import { expect, test } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const GRAPH = {
  nodes: [
    {
      id: 1,
      title: '数字花园是什么',
      slug: 'what-is-garden',
      tags: ['花园'],
      publishedAt: '2026-11-10T08:00:00.000Z',
      updatedAt: '2026-11-18T08:00:00.000Z',
      outgoingLinks: 2,
      incomingLinks: 1,
    },
    {
      id: 2,
      title: '反向链接为什么重要',
      slug: 'why-backlinks',
      tags: ['花园'],
      publishedAt: '2026-11-12T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
      outgoingLinks: 1,
      incomingLinks: 1,
    },
    {
      id: 3,
      title: '还没接上的想法',
      slug: 'dangling-thought',
      tags: ['草稿'],
      publishedAt: '2026-11-14T08:00:00.000Z',
      updatedAt: '2026-11-20T08:00:00.000Z',
      outgoingLinks: 0,
      incomingLinks: 0,
    },
  ],
  edges: [
    { source: 1, target: 2 },
    { source: 2, target: 1 },
  ],
  tags: [{ name: '花园', count: 2, degree: 3 }],
}

test('图谱展示枢纽与孤岛，并能从孤岛起稿', async ({ page }) => {
  // 图谱里的「写新笔记」是后台路由
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll', 'article.publish'],
  })
  await installApiMock(page)
  await page.route(url => url.pathname === '/api/public/garden/graph', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: GRAPH }),
    })
  })

  await page.goto('/portal/notes')
  await page.getByRole('button', { name: '图谱视图' }).click()
  const insights = page.getByRole('region', { name: '花园体检' })
  await expect(insights).toBeVisible({ timeout: 30_000 })

  // 枢纽按被引排序，孤岛只列真正没有边的笔记
  await expect(insights.locator('.insight-hubs li')).toHaveCount(2)
  await expect(insights.locator('.insight-hubs li').first()).toContainText('数字花园是什么')
  await expect(insights.locator('.orphan-chip')).toHaveCount(1)
  await expect(insights.locator('.orphan-chip')).toHaveText('还没接上的想法')
  await expect(insights).toContainText('[[还没接上的想法]]')

  // 点枢纽在图上固定焦点，不跳走页面
  await insights.getByRole('button', { name: '数字花园是什么' }).click()
  await expect(page).toHaveURL(/\/portal\/notes$/)

  const draftLink = insights.locator('.orphan-write')
  await expect(draftLink).toHaveAttribute(
    'href',
    /\/editarticle\?keyword=%E8%BF%98%E6%B2%A1%E6%8E%A5%E4%B8%8A%E7%9A%84%E6%83%B3%E6%B3%95%E7%9A%84%E5%BB%B6%E4%BC%B8/
  )
  await draftLink.click()
  await expect(page).toHaveURL(/\/editarticle\?keyword=/)
  await expect(page.locator('.forms-title')).toHaveValue('还没接上的想法的延伸', { timeout: 30_000 })
})

test('节点上的计数不会骗过孤岛判断，孤岛仍按真实边列出', async ({ page }) => {
  await installApiMock(page)
  await page.route(url => url.pathname === '/api/public/garden/graph', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          ...GRAPH,
          // 计数与实际边不一致时以边为准
          nodes: GRAPH.nodes.map(node => ({ ...node, outgoingLinks: 1, incomingLinks: 1 })),
        },
      }),
    })
  })

  await page.goto('/portal/notes')
  await page.getByRole('button', { name: '图谱视图' }).click()
  const insights = page.getByRole('region', { name: '花园体检' })
  await expect(insights.locator('.orphan-chip')).toHaveText('还没接上的想法')
  await expect(insights.locator('.insight-empty.is-ok')).toHaveCount(0)
})

test('每篇都接上双链时，孤岛区给出完成提示', async ({ page }) => {
  await installApiMock(page)
  await page.route(url => url.pathname === '/api/public/garden/graph', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'ok',
        data: {
          ...GRAPH,
          // 3 通过 1 接回主网，不再有孤岛
          edges: [...GRAPH.edges, { source: 1, target: 3 }],
        },
      }),
    })
  })

  await page.goto('/portal/notes')
  await page.getByRole('button', { name: '图谱视图' }).click()
  const insights = page.getByRole('region', { name: '花园体检' })
  await expect(insights.locator('.insight-empty.is-ok')).toHaveText('每篇笔记都至少有一条双链。')
  await expect(insights.locator('.orphan-chip')).toHaveCount(0)
})
