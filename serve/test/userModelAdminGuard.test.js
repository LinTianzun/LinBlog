const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const userModelPath = path.resolve(__dirname, '../model/dbModel/users/index.js')
const originalLoad = Module._load
const calls = []

let adminRows = []
let targetRows = []
let updateResult = { affectedRows: 1 }
let deleteResult = { affectedRows: 1 }

const connection = {
    query(sql, values, callback) {
        calls.push({ sql, values })

        if (sql.includes('WHERE user_type = ?')) {
            callback(null, adminRows)
            return
        }

        if (sql.includes('FROM users') && sql.includes('WHERE id = ?')) {
            callback(null, targetRows)
            return
        }

        if (sql.includes('UPDATE users')) {
            callback(null, updateResult)
            return
        }

        if (sql.includes('DELETE FROM users')) {
            callback(null, deleteResult)
            return
        }

        callback(new Error(`Unexpected SQL: ${sql}`))
    }
}

const db = {
    async query(sql, values) {
        throw new Error(`Guarded operations must use a transaction connection: ${sql} ${values}`)
    },
    async withTransaction(callback) {
        return callback(connection)
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === userModelPath && request === '../../db/dbnew') {
        return db
    }
    return originalLoad.call(this, request, parent, isMain)
}

const userModel = require(userModelPath)
Module._load = originalLoad

function admin(id, status) {
    return { id, user_type: 'admin', status }
}

test.beforeEach(() => {
    calls.length = 0
    adminRows = []
    targetRows = []
    updateResult = { affectedRows: 1 }
    deleteResult = { affectedRows: 1 }
})

test('demoting the only active admin is blocked after locking admin rows', async () => {
    adminRows = [admin(1, 0), admin(2, 1)]
    targetRows = [admin(2, 1)]

    const result = await userModel.updateUserByAdminGuarded(
        2,
        { username: 'admin-two', mail: 'admin-two@example.com', user_type: 'normal' },
        1
    )

    assert.deepEqual(result, { ok: false, reason: 'last_admin' })
    assert.equal(calls.some((call) => /FOR UPDATE/.test(call.sql)), true)
    assert.equal(calls.some((call) => /UPDATE users/.test(call.sql)), false)
})

test('an active admin can be demoted when another active admin remains', async () => {
    adminRows = [admin(1, 1), admin(2, 1)]
    targetRows = [admin(2, 1)]

    const result = await userModel.updateUserByAdminGuarded(
        2,
        { username: 'admin-two', mail: 'admin-two@example.com', user_type: 'normal' },
        1
    )

    assert.deepEqual(result, { ok: true })
    assert.equal(calls.some((call) => /UPDATE users/.test(call.sql)), true)
})

test('unchanged guarded updates still report success', async () => {
    adminRows = [admin(1, 1), admin(2, 1)]
    targetRows = [admin(2, 1)]
    updateResult = { affectedRows: 0 }

    assert.deepEqual(
        await userModel.updateUserByAdminGuarded(
            2,
            { username: 'admin-two', mail: 'admin-two@example.com', user_type: 'admin' },
            1
        ),
        { ok: true }
    )

    assert.deepEqual(
        await userModel.updateUserStatusGuarded(2, 1, 1),
        { ok: true }
    )
})

test('a disabled admin can be demoted without consuming the active admin quota', async () => {
    adminRows = [admin(1, 1), admin(2, 0)]
    targetRows = [admin(2, 0)]

    const result = await userModel.updateUserByAdminGuarded(
        2,
        { username: 'admin-two', mail: 'admin-two@example.com', user_type: 'normal' },
        1
    )

    assert.deepEqual(result, { ok: true })
    assert.equal(calls.some((call) => /UPDATE users/.test(call.sql)), true)
})

test('the only active admin cannot be disabled or deleted', async () => {
    adminRows = [admin(1, 0), admin(2, 1)]
    targetRows = [admin(2, 1)]

    assert.deepEqual(
        await userModel.updateUserStatusGuarded(2, 0, 1),
        { ok: false, reason: 'last_admin' }
    )

    assert.deepEqual(
        await userModel.deleteUserByAdminGuarded(2, 1),
        { ok: false, reason: 'last_admin' }
    )

    assert.equal(calls.some((call) => /UPDATE users/.test(call.sql)), false)
    assert.equal(calls.some((call) => /DELETE FROM users/.test(call.sql)), false)
})

test('administrators cannot change their own guarded role or delete themselves', async () => {
    adminRows = [admin(1, 1), admin(2, 1)]
    targetRows = [admin(1, 1)]

    assert.deepEqual(
        await userModel.updateUserByAdminGuarded(
            1,
            { username: 'admin', mail: 'admin@example.com', user_type: 'normal' },
            1
        ),
        { ok: false, reason: 'self_role_change' }
    )

    assert.deepEqual(
        await userModel.deleteUserByAdminGuarded(1, 1),
        { ok: false, reason: 'self_delete' }
    )
})
