const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const controllerPath = path.resolve(__dirname, '../controller/userController.js')
const originalLoad = Module._load
const calls = []

let targetUser = {
    id: 2,
    username: 'admin-two',
    mail: 'admin-two@example.com',
    user_type: 'admin'
}
let updateGuardResult = { ok: true }
let statusGuardResult = { ok: true }
let deleteGuardResult = { ok: true }

const userModel = {
    async findUserById() {
        return targetUser ? [targetUser] : []
    },
    async findUserConflictForUpdate() {
        calls.push({ method: 'findUserConflictForUpdate' })
        return []
    },
    async updateUserByAdminGuarded(userId, data, currentUserId) {
        calls.push({
            method: 'updateUserByAdminGuarded',
            userId,
            data,
            currentUserId
        })
        return updateGuardResult
    },
    async updateUserStatusGuarded(userId, status, currentUserId) {
        calls.push({
            method: 'updateUserStatusGuarded',
            userId,
            status,
            currentUserId
        })
        return statusGuardResult
    },
    async deleteUserByAdminGuarded(userId, currentUserId) {
        calls.push({
            method: 'deleteUserByAdminGuarded',
            userId,
            currentUserId
        })
        return deleteGuardResult
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/users/index') return userModel
    }
    return originalLoad.call(this, request, parent, isMain)
}

const userController = require(controllerPath)
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
    updateGuardResult = { ok: true }
    statusGuardResult = { ok: true }
    deleteGuardResult = { ok: true }
    targetUser = {
        id: 2,
        username: 'admin-two',
        mail: 'admin-two@example.com',
        user_type: 'admin'
    }
})

test('admins cannot change their own role through the edit endpoint', async () => {
    targetUser.id = 1
    const res = makeResponse()

    await userController.updateUser({
        params: { id: '1' },
        body: {
            username: 'admin',
            mail: 'admin@example.com',
            user_type: 'normal'
        },
        user: { userId: 1, user_type: 'admin' }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /不能修改当前登录账号的角色/)
    assert.equal(
        calls.some((call) => call.method === 'updateUserByAdminGuarded'),
        false
    )
})

test('the last admin cannot be demoted', async () => {
    updateGuardResult = { ok: false, reason: 'last_admin' }
    const res = makeResponse()

    await userController.updateUser({
        params: { id: '2' },
        body: {
            username: 'admin-two',
            mail: 'admin-two@example.com',
            user_type: 'normal'
        },
        // 只有超级管理员能改其他管理员账号，因此这里的操作者必须是超级管理员
        user: { userId: 1, user_type: 'admin', is_super_admin: 1 }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /至少需要保留一名管理员/)
    assert.deepEqual(
        calls.find((call) => call.method === 'updateUserByAdminGuarded'),
        {
            method: 'updateUserByAdminGuarded',
            userId: 2,
            data: {
                username: 'admin-two',
                mail: 'admin-two@example.com',
                user_type: 'normal'
            },
            currentUserId: 1
        }
    )
})

test('an admin can be demoted when another admin remains', async () => {
    const res = makeResponse()

    await userController.updateUser({
        params: { id: '2' },
        body: {
            username: 'admin-two',
            mail: 'admin-two@example.com',
            user_type: 'normal'
        },
        user: { userId: 1, user_type: 'admin', is_super_admin: 1 }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(
        calls.some((call) => call.method === 'updateUserByAdminGuarded'),
        true
    )
})

test('the last admin cannot be disabled', async () => {
    statusGuardResult = { ok: false, reason: 'last_admin' }
    const res = makeResponse()

    await userController.updateUserStatus({
        params: { id: '2' },
        body: { status: 0 },
        user: { userId: 1, user_type: 'admin', is_super_admin: 1 }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /至少需要保留一名管理员/)
    assert.equal(
        calls.some((call) => call.method === 'updateUserStatusGuarded'),
        true
    )
})

test('the last admin cannot be deleted', async () => {
    deleteGuardResult = { ok: false, reason: 'last_admin' }
    const res = makeResponse()

    await userController.deleteUser({
        params: { id: '2' },
        user: { userId: 1, user_type: 'admin', is_super_admin: 1 }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /至少需要保留一名管理员/)
    assert.deepEqual(
        calls.find((call) => call.method === 'deleteUserByAdminGuarded'),
        {
            method: 'deleteUserByAdminGuarded',
            userId: 2,
            currentUserId: 1
        }
    )
})
