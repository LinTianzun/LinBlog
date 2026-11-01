import { expect, test, type Page } from '@playwright/test'
import { article, installApiMock, modalRootClass, seedSession } from './fixtures/mockApi'

// 深链接详情要等门户列表接口返回后才弹出；并行执行时 mock 响应可能较慢，
// 默认 5 秒超时不够，统一放宽到 20 秒。
const DETAIL_TIMEOUT = 20_000

function articleDetail(page: Page) {
  return page.locator(modalRootClass).filter({ hasText: '文章阅读' })
}

test('登录用户可选择原因举报他人评论', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = articleDetail(page)
  await expect(detail).toBeVisible({ timeout: DETAIL_TIMEOUT })
  await expect(detail.getByText('这是一条待举报的评论')).toBeVisible()

  await detail.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('button', { name: '举报', exact: true }).click()

  const reportDialog = page.locator(modalRootClass).filter({ hasText: '举报评论' })
  await expect(reportDialog).toBeVisible()
  await reportDialog.getByRole('radio', { name: /广告或引流/ }).click()

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === '/api/public/comment/report'
  )
  await reportDialog.getByRole('button', { name: '提交举报' }).click()

  const request = await requestPromise
  expect(request.postDataJSON()).toMatchObject({
    commentType: 'article',
    commentId: 201,
    reason: 'spam',
  })
  await expect(reportDialog).toBeHidden()
})

test('举报弹窗在未选原因时不可提交，其他原因可附补充说明', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = articleDetail(page)
  await expect(detail).toBeVisible({ timeout: DETAIL_TIMEOUT })
  await detail.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('button', { name: '举报', exact: true }).click()

  const reportDialog = page.locator(modalRootClass).filter({ hasText: '举报评论' })
  await expect(reportDialog).toBeVisible()
  await expect(reportDialog.getByRole('button', { name: '提交举报' })).toBeDisabled()
  await expect(page.locator('.report-reason')).toHaveCount(6)

  await reportDialog.getByRole('radio', { name: /其他原因/ }).click()
  await reportDialog.getByPlaceholder('可以补充具体情况，最多 200 个字符')
    .fill('这条评论与上下文完全无关')

  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === '/api/public/comment/report'
  )
  await reportDialog.getByRole('button', { name: '提交举报' }).click()

  const request = await requestPromise
  expect(request.postDataJSON()).toMatchObject({
    commentType: 'article',
    commentId: 201,
    reason: 'other',
    detail: '这条评论与上下文完全无关',
  })
  await expect(reportDialog).toBeHidden()
})
