const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const controllerPath = path.resolve(__dirname, '../controller/userController.js')
const originalLoad = Module._load
const calls = []

// 默认目标：一名普通管理员（超级管理员之外的角色）
let targetUser = {
    id: 2,
    username: 'admin-two',
    mail: 'admin-two@example.com',
    user_type: 'admin',
    is_super_admin: 0
}
// 超级管理员账号：固定邮箱、不可删除/禁用/降级
const superAdminUser = {
    id: 1,
    username: 'admin',
    mail: 'admin@linlog.com',
    user_type: 'admin',
    is_super_admin: 1
}
let guardResults = {
    update: { ok: true },
    status: { ok: true },
    delete: { ok: true }
}

const userModel = {
    async findUserById() {
        return targetUser ? [targetUser] : []
    },
    async findUserConflictForUpdate() {
        return []
    },
    async updateUserByAdminGuarded(userId, data, currentUserId) {
        calls.push({ method: 'updateUserByAdminGuarded', userId, data, currentUserId })
        return guardResults.update
    },
    async updateUserStatusGuarded(userId, status, currentUserId) {
        calls.push({ method: 'updateUserStatusGuarded', userId, status, currentUserId })
        return guardResults.status
    },
    async deleteUserByAdminGuarded(userId, currentUserId) {
        calls.push({ method: 'deleteUserByAdminGuarded', userId, currentUserId })
        return guardResults.delete
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/users/index') return userModel
        if (request === '../utils/logHelper') return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const userController = require(controllerPath)
Module._load = originalLoad

const ADMIN_PERMISSIONS = [
    'user.view', 'user.create', 'user.edit', 'user.disable', 'user.delete'
]

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

// 非超级管理员操作者：即便持有全部用户管理权限，也不能碰超级管理员
const adminActor = { userId: 2, user_type: 'admin', permissions: ADMIN_PERMISSIONS }
const superActor = {
    userId: 1,
    user_type: 'admin',
    is_super_admin: 1,
    isSuperAdmin: true,
    permissions: ADMIN_PERMISSIONS
}

test.beforeEach(() => {
    calls.length = 0
    guardResults = { update: { ok: true }, status: { ok: true }, delete: { ok: true } }
    targetUser = {
        id: 2,
        username: 'admin-two',
        mail: 'admin-two@example.com',
        user_type: 'admin',
        is_super_admin: 0
    }
})

test('ordinary admins cannot edit the super admin account', async () => {
    targetUser = { ...superAdminUser }
    const res = makeResponse()

    await userController.updateUser({
        params: { id: '1' },
        body: { username: 'admin', mail: 'admin@linlog.com', user_type: 'admin' },
        user: { ...adminActor, userId: 2 }
    }, res)

    assert.equal(res.statusCode, 403)
    assert.match(res.body.message, /超级管理员账号不可由其他管理员修改/)
    assert.equal(calls.length, 0)
})

test('the super admin role and fixed mail cannot be changed', async () => {
    targetUser = { ...superAdminUser }
    const res = makeResponse()

    await userController.updateUser({
        params: { id: '1' },
        body: { username: 'admin', mail: 'admin@linlog.com', user_type: 'normal' },
        user: superActor
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /角色和固定邮箱不可修改/)
    assert.equal(calls.length, 0)

    const mailRes = makeResponse()
    await userController.updateUser({
        params: { id: '1' },
        body: { username: 'admin', mail: 'other@example.com', user_type: 'admin' },
        user: superActor
    }, mailRes)

    assert.equal(mailRes.statusCode, 400)
    assert.equal(calls.length, 0)
})

test('the super admin account cannot be disabled or deleted', async () => {
    targetUser = { ...superAdminUser }

    const statusRes = makeResponse()
    await userController.updateUserStatus({
        params: { id: '1' },
        body: { status: 0 },
        user: { ...adminActor, userId: 2 }
    }, statusRes)

    assert.equal(statusRes.statusCode, 403)
    assert.match(statusRes.body.message, /超级管理员账号不可禁用/)
    assert.equal(calls.length, 0)

    const deleteRes = makeResponse()
    await userController.deleteUser({
        params: { id: '1' },
        user: { ...adminActor, userId: 2 }
    }, deleteRes)

    assert.equal(deleteRes.statusCode, 403)
    assert.match(deleteRes.body.message, /超级管理员账号不可删除/)
    assert.equal(calls.length, 0)
})

test('only the super admin may create or promote admin accounts', async () => {
    const createRes = makeResponse()
    await userController.createUser({
        body: {
            username: 'new-admin',
            mail: 'new-admin@example.com',
            password: 'secret123',
            user_type: 'admin'
        },
        user: adminActor
    }, createRes)

    assert.equal(createRes.statusCode, 403)
    assert.match(createRes.body.message, /只有超级管理员可以创建管理员账号/)

    // 目标改成普通用户：普通管理员把他人提升为管理员时必须被拒绝
    targetUser = { ...targetUser, id: 3, user_type: 'normal' }
    const promoteRes = makeResponse()
    await userController.updateUser({
        params: { id: '3' },
        body: { username: 'someone', mail: 'someone@example.com', user_type: 'admin' },
        // 普通管理员把别人提升为管理员：必须被拒绝
        user: { ...adminActor, userId: 2 }
    }, promoteRes)

    assert.equal(promoteRes.statusCode, 403)
    assert.match(promoteRes.body.message, /只有超级管理员可以授予管理员角色/)
    assert.equal(calls.length, 0)
})

test('the super admin keeps every permission including the protected ones', () => {
    const accessControl = require(path.resolve(__dirname, '../utils/accessControl.js'))
    const { PERMISSIONS } = require(path.resolve(__dirname, '../config/accessControl.js'))

    const permissions = accessControl.getPermissionsForUser({
        userId: 1,
        userType: 'admin',
        isSuperAdmin: true
    })

    for (const permission of PERMISSIONS) {
        assert.ok(permissions.includes(permission.key), `缺少权限：${permission.key}`)
        assert.ok(accessControl.hasPermission({ userId: 1, isSuperAdmin: true }, permission.key))
    }
})

test('login and profile responses carry the super admin flag and permissions', () => {
    const accessControl = require(path.resolve(__dirname, '../utils/accessControl.js'))
    const { ALL_PERMISSION_KEYS } = require(path.resolve(__dirname, '../config/accessControl.js'))

    // 游客默认只保留收发私信，其余能力一律关闭
    const anonymous = accessControl.getPermissionsForUser({ userType: 'visitor' })
    assert.deepEqual(anonymous, ['message.private'])

    const superAdmin = { userType: 'admin', is_super_admin: 1 }
    assert.deepEqual(
        accessControl.getPermissionsForUser(superAdmin).sort(),
        [...ALL_PERMISSION_KEYS].sort()
    )
})
