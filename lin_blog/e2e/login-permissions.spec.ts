import { expect, test } from '@playwright/test'
import { installApiMock } from './fixtures/mockApi'

test('登录后按权限回落到系统设置，并拦截用户管理', async ({ page }) => {
  await installApiMock(page)

  await page.goto('/loginRegister')
  // 登录页同时挂载登录与注册两个表单，占位符重复；外层容器 .form-box.login
  // 包住登录表单，用它限定作用域
  const loginForm = page.locator('.form-box.login')
  await loginForm.getByPlaceholder('用户名').fill('user@example.com')
  await loginForm.getByPlaceholder('密码').fill('123456')
  await loginForm.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page).toHaveURL(/\/setting$/)
  const menu = page.locator('.menu-bar')
  await expect(menu.getByText('系统设置', { exact: true })).toBeVisible()
  await expect(menu.getByText('系统总览', { exact: true })).toHaveCount(0)
  await expect(menu.getByText('用户管理', { exact: true })).toHaveCount(0)

  await page.goto('/userManagement')
  await expect(page).toHaveURL(/\/setting$/)
  await expect(page.locator('.menu-bar').getByText('用户管理', { exact: true })).toHaveCount(0)
})
