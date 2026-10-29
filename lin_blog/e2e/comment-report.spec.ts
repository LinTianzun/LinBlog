import { expect, test } from '@playwright/test'
import { article, installApiMock, modalRootClass, seedSession } from './fixtures/mockApi'

test('登录用户可选择原因举报他人评论', async ({ page }) => {
  await installApiMock(page)
  await seedSession(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
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
