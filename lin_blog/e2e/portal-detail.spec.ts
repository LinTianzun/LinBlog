import { expect, test } from '@playwright/test'
import { article, installApiMock, modalRootClass } from './fixtures/mockApi'

test('门户文章详情可通过 open 深链接直接打开和关闭', async ({ page }) => {
  await installApiMock(page)

  await page.goto(`/portal/articles?open=${article.id}`)

  const detail = page.locator(modalRootClass).filter({ hasText: '文章阅读' })
  await expect(detail).toBeVisible()
  await expect(detail.getByRole('heading', { name: article.title })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`open=${article.id}`))
  await expect(page).toHaveTitle(new RegExp(article.title))

  await detail.locator('.yk-modal__close').click()

  await expect(detail).toBeHidden()
  await expect(page).not.toHaveURL(/open=/)
})
