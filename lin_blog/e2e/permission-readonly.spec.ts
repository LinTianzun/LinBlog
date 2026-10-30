import { expect, test, type Route } from '@playwright/test'
import { installApiMock, seedSession } from './fixtures/mockApi'

const catalog = {
  roles: [
    {
      key: 'super_admin',
      userType: 'admin',
      label: '超级管理员',
      description: '固定全权限',
      editable: false,
      tone: 'danger',
      permissions: ['permission.view', 'permission.edit'],
      memberCount: 1,
    },
    {
      key: 'admin',
      userType: 'admin',
      label: '管理员',
      description: '可配置日常运营能力',
      editable: true,
      tone: 'primary',
      permissions: ['permission.view'],
      memberCount: 2,
    },
  ],
  groups: [
    {
      key: 'system',
      label: '系统与权限',
      description: '系统设置与权限矩阵',
      permissions: [
        {
          key: 'permission.view',
          group: 'system',
          label: '查看权限矩阵',
          description: '查看角色与权限对应关系',
        },
        {
          key: 'permission.edit',
          group: 'system',
          label: '修改权限矩阵',
          description: '调整角色权限，仅超级管理员可持有',
          risk: 'critical',
          protected: true,
        },
      ],
    },
  ],
  editableRoles: ['admin'],
}

const fulfillCatalog = async (route: Route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message: 'ok', data: catalog }),
  })
}

test('非超级管理员进入权限矩阵时为只读模式', async ({ page }) => {
  await installApiMock(page)
  await page.route(url => url.pathname === '/api/permission/catalog', fulfillCatalog)
  await seedSession(page, {
    id: 1,
    username: '林知雨',
    isSuperAdmin: false,
    permissions: ['permission.view'],
  })

  await page.goto('/permissionManagement')

  await expect(page.getByText('只读模式：仅超级管理员可以修改权限矩阵')).toBeVisible()
  await expect(page.getByRole('button', { name: /保存/ })).toHaveCount(0)
  await expect(page.locator('.permission-col-role-action')).toHaveCount(0)
  await expect(page.locator('.permission-switch').first()).toBeDisabled()
  await expect(page.locator('.permission-switch.is-locked')).toHaveCount(4)
  await expect(page.getByText('已与服务端一致')).toBeVisible()
})
