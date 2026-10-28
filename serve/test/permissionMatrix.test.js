const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const controllerPath = path.resolve(__dirname, '../controller/permissionController.js')
const originalLoad = Module._load
const calls = []
let roleCounts = { admin: 1, editor: 2, normal: 5, visitor: 3, super_admin: 1 }
let replaceError = null
let writtenLogs = []
// 替身「数据库」：写入后下次读取要能看到，否则刷新缓存会把改动抹掉
let storedRows = []

const userModel = {
    async countRoleDistribution() {
        return roleCounts
    }
}

const permissionModel = {
    async findAllRolePermissions() {
        return storedRows
    },
    async replaceRolePermissions(changes, updatedBy) {
        calls.push({ method: 'replaceRolePermissions', changes, updatedBy })
        if (replaceError) throw replaceError
        for (const change of changes) {
            const index = storedRows.findIndex(row =>
                row.role_key === change.roleKey && row.permission_key === change.permissionKey
            )
            const row = {
                role_key: change.roleKey,
                permission_key: change.permissionKey,
                allowed: change.allowed ? 1 : 0
            }
            if (index >= 0) storedRows[index] = row
            else storedRows.push(row)
        }
        return { updated: changes.length }
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/users/index') return userModel
        // 权限矩阵变化必须可审计：日志模块固定走替身，避免真实写库
        if (request === '../utils/logHelper') {
            return { writeSystemLog: payload => writtenLogs.push(payload) }
        }
    }
    const accessControlPath = path.resolve(__dirname, '../utils/accessControl.js')
    if (parent && parent.filename === accessControlPath) {
        if (request === '../model/dbModel/permission/index') return permissionModel
    }
    return originalLoad.call(this, request, parent, isMain)
}
const permissionController = require(controllerPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(body) {
            this.body = body
            return this
        }
    }
}

test.beforeEach(() => {
    calls.length = 0
    writtenLogs = []
    replaceError = null
    storedRows = []
    roleCounts = { admin: 1, editor: 2, normal: 5, visitor: 3, super_admin: 1 }
})

test('permission catalog exposes all roles and marks only the super admin as fixed', async () => {
    const res = makeResponse()
    await permissionController.getPermissionCatalog({}, res)

    assert.equal(res.statusCode, 200)
    const { roles, groups } = res.body.data
    assert.ok(roles.length >= 5)

    const superAdmin = roles.find(role => role.key === 'super_admin')
    assert.equal(superAdmin.editable, false)
    // 超级管理员固定持有全部权限，前端应整列禁用
    assert.ok(superAdmin.permissions.length > 20)
    assert.equal(superAdmin.memberCount, 1)

    const admin = roles.find(role => role.key === 'admin')
    assert.equal(admin.editable, true)
    // 受保护权限（修改权限矩阵）与授予管理员都不对普通管理员开放
    assert.equal(admin.permissions.includes('permission.edit'), false)
    assert.equal(admin.permissions.includes('user.assignAdmin'), false)

    const visitor = roles.find(role => role.key === 'visitor')
    assert.deepEqual(visitor.permissions, ['message.private'])

    // 每个权限都必须归属到某个分组，前端按分组渲染才不会漏项
    const grouped = groups.reduce((sum, group) => sum + group.permissions.length, 0)
    assert.equal(grouped, superAdmin.permissions.length)
})

test('updating the matrix rejects protected permissions and unknown roles', async () => {
    const res = makeResponse()
    await permissionController.updateMatrix({
        body: { changes: [{ roleKey: 'admin', permissionKey: 'permission.edit', allowed: true }] },
        user: { userId: 1 }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /超级管理员固定持有/)
    assert.equal(calls.length, 0)

    const unknownRole = makeResponse()
    await permissionController.updateMatrix({
        body: { changes: [{ roleKey: 'super_admin', permissionKey: 'article.create', allowed: true }] },
        user: { userId: 1 }
    }, unknownRole)

    assert.equal(unknownRole.statusCode, 400)
    assert.match(unknownRole.body.message, /无效的角色/)
    assert.equal(calls.length, 0)

    const unknownPermission = makeResponse()
    await permissionController.updateMatrix({
        body: { changes: [{ roleKey: 'editor', permissionKey: 'article.destroy', allowed: true }] },
        user: { userId: 1 }
    }, unknownPermission)

    assert.equal(unknownPermission.statusCode, 400)
    assert.match(unknownPermission.body.message, /无效的权限/)
    assert.equal(calls.length, 0)
})

test('updating the matrix persists deduplicated changes and refreshes the cache', async () => {
    const res = makeResponse()
    await permissionController.updateMatrix({
        body: {
            changes: [
                { roleKey: 'editor', permissionKey: 'systemLog.view', allowed: true },
                { roleKey: 'editor', permissionKey: 'systemLog.view', allowed: true },
                { roleKey: 'normal', permissionKey: 'diary.create', allowed: false }
            ]
        },
        user: { userId: 9 }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(calls[0].changes, [
        { roleKey: 'editor', permissionKey: 'systemLog.view', allowed: true },
        { roleKey: 'normal', permissionKey: 'diary.create', allowed: false }
    ])
    assert.equal(calls[0].updatedBy, 9)
    // 审计日志要写明谁把哪个角色的哪项能力打开或关闭，而不只是「更新 N 项」
    assert.equal(writtenLogs.length, 1)
    assert.equal(writtenLogs[0].module, 'permission')
    assert.match(writtenLogs[0].detail, /编辑 授予「查看系统日志」/)
    assert.match(writtenLogs[0].detail, /普通用户 收回「创建随笔」/)

    // 保存后立即刷新缓存：新颁发的令牌不需要等重启才生效
    const { getPermissionsForUser, hasPermission } = require(path.resolve(__dirname, '../utils/accessControl.js'))
    const editor = { userId: 3, userType: 'editor' }
    assert.ok(getPermissionsForUser(editor).includes('systemLog.view'))
    assert.ok(hasPermission(editor, 'systemLog.view'))

    const normal = { userId: 4, userType: 'normal' }
    assert.equal(getPermissionsForUser(normal).includes('diary.create'), false)
})

test('my permissions exposes the effective set and the super admin flag', () => {
    const res = makeResponse()
    permissionController.getMyPermissions({
        user: { userId: 1, userType: 'admin', isSuperAdmin: true }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.isSuperAdmin, true)
    assert.equal(res.body.data.canEditPermissions, true)
    assert.ok(res.body.data.permissions.includes('permission.edit'))

    const plainRes = makeResponse()
    permissionController.getMyPermissions({
        user: { userId: 2, userType: 'admin', isSuperAdmin: false }
    }, plainRes)

    assert.equal(plainRes.body.data.isSuperAdmin, false)
    assert.equal(plainRes.body.data.canEditPermissions, false)
    assert.equal(plainRes.body.data.permissions.includes('permission.edit'), false)
})

test('permission routes keep catalog readable for admins but restrict writes to the super admin', () => {
    const express = require('express')
    const app = express()
    const routes = []
    for (const method of ['get', 'put']) {
        const original = app[method]
        app[method] = (routePath, ...handlers) => {
            routes.push({ method, path: routePath, handlers })
            return app
        }
        app[`_original_${method}`] = original
    }

    require('../routes/permission')(app)

    const catalog = routes.find(route => route.path === '/api/permission/catalog')
    const me = routes.find(route => route.path === '/api/permission/me')
    const matrix = routes.find(route => route.path === '/api/permission/matrix')

    assert.ok(catalog && me && matrix, '缺少权限管理路由')
    assert.equal(catalog.handlers[0].name, 'authMiddleware')
    assert.equal(me.handlers.length, 2)

    // 中间件是工厂返回的匿名函数，直接按行为验证：
    // 目录读取要求 permission.view，矩阵写入只有超级管理员能过
    const runGuard = (handlers, user) => {
        let passed = false
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this },
            json() { return this }
        }
        handlers[1]({ user }, res, () => { passed = true })
        return { passed, statusCode: res.statusCode }
    }

    const adminUser = { userId: 2, userType: 'admin', permissions: ['permission.view'] }
    const editorUser = { userId: 3, userType: 'editor' }

    assert.deepEqual(runGuard(catalog.handlers, adminUser), { passed: true, statusCode: 200 })
    assert.deepEqual(runGuard(catalog.handlers, editorUser), { passed: false, statusCode: 403 })

    assert.deepEqual(
        runGuard(matrix.handlers, { userId: 1, isSuperAdmin: true }),
        { passed: true, statusCode: 200 }
    )
    assert.deepEqual(runGuard(matrix.handlers, adminUser), { passed: false, statusCode: 403 })
})

test('describePermissionChanges stays within the log column and summarizes the overflow', () => {
    const { describePermissionChanges } = require('../utils/accessControl.js')
    const { ALL_PERMISSION_KEYS } = require('../config/accessControl.js')
    const { EDITABLE_ROLE_KEYS } = require('../config/accessControl.js')

    const changes = []
    for (const roleKey of EDITABLE_ROLE_KEYS) {
        for (const permissionKey of ALL_PERMISSION_KEYS) {
            changes.push({ roleKey, permissionKey, allowed: true })
        }
    }

    const detail = describePermissionChanges(changes)

    assert.ok(detail.length <= 500, `descriptor too long: ${detail.length}`)
    assert.match(detail, /^角色权限变更：/)
    // 超出可读长度后用总数收尾，避免被 VARCHAR(500) 截断
    assert.match(detail, new RegExp(`等 ${changes.length} 项$`))
})
