import { expect, test } from '@playwright/test'
import { article, installApiMock, seedSession } from './fixtures/mockApi'

const EDITOR_ARTICLE_ID = 1201

/**
 * 一篇包含四种代码块的历史文章：
 * CSS / HTML / JavaScript 仍在裁剪后语言清单内，python 只不在清单内。
 */
const EDITOR_ARTICLE = {
  ...article,
  id: EDITOR_ARTICLE_ID,
  state: 'draft',
  content: [
    '<p>代码块高亮回归</p>',
    '<pre><code class="language-css">.a { color: #fff; }</code></pre>',
    '<pre><code class="language-html">&lt;div id="app"&gt;hi&lt;/div&gt;</code></pre>',
    '<pre><code class="language-javascript">const a = 100;</code></pre>',
    '<pre><code class="language-python">print("hi")</code></pre>',
  ].join(''),
}

test('编辑页代码块保留高亮，且语言菜单可切到 JavaScript', async ({ page }) => {
  await seedSession(page, {
    id: 1,
    isSuperAdmin: true,
    username: '林知雨',
    mail: 'admin@linlog.com',
    permissions: ['article.create', 'article.manageAll', 'article.viewAll'],
  })
  await installApiMock(page)

  // 编辑页走登录态详情接口 /api/article/:id，通用 mock 未覆盖这一条
  await page.route(
    url => url.pathname === `/api/article/${EDITOR_ARTICLE_ID}`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: EDITOR_ARTICLE }),
      })
    }
  )

  // 编辑页正文改从工作稿接口读取，代码块内容要一并覆盖
  await page.route(
    url => url.pathname === `/api/article/${EDITOR_ARTICLE_ID}/workflow`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          message: 'ok',
          data: {
            articleId: EDITOR_ARTICLE_ID,
            classify: 'article',
            state: 'draft',
            revision: 0,
            savedAt: EDITOR_ARTICLE.updatedAt,
            scheduledAt: null,
            publishedAt: null,
            hasUnpublishedChanges: false,
            workingCopy: {
              title: EDITOR_ARTICLE.title,
              subsetId: EDITOR_ARTICLE.subsetId,
              classify: 'article',
              label: EDITOR_ARTICLE.label,
              introduce: EDITOR_ARTICLE.introduce,
              content: EDITOR_ARTICLE.content,
              cover: EDITOR_ARTICLE.cover ?? '',
              state: 'draft',
            },
          },
        }),
      })
    }
  )

  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(`/editarticle/${EDITOR_ARTICLE_ID}`)
  await expect(page.locator('.w-e-text-container')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.w-e-toolbar')).toBeVisible()

  // 工具栏必须渲染出菜单（core 无默认 toolbarKeys，裁剪版需自行复刻）
  const toolbarItems = await page.locator('.w-e-toolbar .w-e-bar-item').count()
  expect(toolbarItems).toBeGreaterThan(5)

  const codeBlocks = page.locator('.w-e-text-container pre > code')
  await expect(codeBlocks).toHaveCount(4)

  // CSS / HTML / JavaScript 都应切出 prism token；
  // python 不在裁剪后的语言清单里，只失去着色，文本必须原样保留。
  for (const index of [0, 1, 2]) {
    const block = codeBlocks.nth(index)
    await expect(block).toBeVisible()
    await expect(block.locator('.token')).not.toHaveCount(0)
  }

  const pythonBlock = codeBlocks.nth(3)
  await expect(pythonBlock).toBeVisible()
  await expect(pythonBlock).toHaveText('print("hi")')
  await expect(pythonBlock.locator('.token')).toHaveCount(0)

  // 选中代码块后，悬浮菜单应能展开语言列表并切换语言
  await codeBlocks.first().click()
  const langSelect = page.locator('.w-e-hover-bar [data-menu-key="codeSelectLang"]')
  await expect(langSelect).toBeVisible({ timeout: 10_000 })
  await expect(langSelect).toHaveText(/CSS/)

  await langSelect.click()
  const options = page.locator('.w-e-select-list li')
  // plain text + CSS / HTML / XML / JavaScript，与裁剪后的 Prism 能力一致
  await expect(options).toHaveCount(5)

  const javascriptOption = options.filter({ hasText: 'JavaScript' })
  await expect(javascriptOption).toHaveCount(1)
  await javascriptOption.click()
  await expect(langSelect).toHaveText(/JavaScript/)

  expect(errors, `控制台不应报错：${errors.join(' | ')}`).toHaveLength(0)
})
