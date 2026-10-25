const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/userController.js')
const originalLoad = Module._load

const bcrypt = require('bcrypt')
let storedPasswordHash = ''
let updatedHash = null

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath && request === '../model/dbModel/users/index') {
        return {
            findUserById: async () => [{ id: 7, username: 'tester', password: storedPasswordHash }],
            updateUserPassword: async (_userId, hash) => { updatedHash = hash }
        }
    }
    if (parent && parent.filename === controllerPath && request === '../utils/logHelper') {
        return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { changePassword, updateAvatar } = require(controllerPath)
Module._load = originalLoad

function response() {
    return {
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

async function submit(body) {
    const res = response()
    await changePassword({ body, user: { userId: 7, user_type: 'normal' }, ip: '127.0.0.1' }, res)
    return res
}

test.before(async () => {
    storedPasswordHash = await bcrypt.hash('123456', 10)
})

test.beforeEach(() => { updatedHash = null })

test('rejects missing or too short new password', async () => {
    assert.equal((await submit({})).statusCode, 400)
    assert.equal((await submit({ oldPassword: '123456', newPassword: '123' })).statusCode, 400)
    assert.equal(updatedHash, null)
})

test('rejects same password and wrong old password', async () => {
    const same = await submit({ oldPassword: '123456', newPassword: '123456' })
    assert.equal(same.statusCode, 400)

    const wrong = await submit({ oldPassword: 'wrong-old', newPassword: '654321' })
    assert.equal(wrong.statusCode, 400)
    assert.equal(wrong.body.message, '当前密码不正确')
    assert.equal(updatedHash, null)
})

test('updates password with a fresh bcrypt hash', async () => {
    const res = await submit({ oldPassword: '123456', newPassword: 'new-pass-123' })
    assert.equal(res.body.code, 200)
    assert.ok(updatedHash && updatedHash !== storedPasswordHash)
    assert.ok(updatedHash.startsWith('$2'))
})

test('updateAvatar accepts only site-internal uploads URLs', async () => {
    let savedAvatar = null
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === controllerPath && request === '../model/dbModel/users/index') {
            return {
                findUserById: async () => [{ id: 7, username: 'tester', password: storedPasswordHash }],
                updateUserPassword: async () => {},
                updateUserAvatar: async (_userId, imgurl) => { savedAvatar = imgurl }
            }
        }
        if (parent && parent.filename === controllerPath && request === '../utils/logHelper') {
            return { writeSystemLog: () => {} }
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    const patched = require.cache[controllerPath]
    delete require.cache[controllerPath]
    const freshController = require(controllerPath)
    if (patched) require.cache[controllerPath] = patched

    try {
        const bad = response()
        await freshController.updateAvatar({
            body: { imgurl: 'https://evil.example.com/a.jpg' },
            user: { userId: 7, user_type: 'normal' },
            ip: '127.0.0.1'
        }, bad)
        assert.equal(bad.statusCode, 400)
        assert.equal(savedAvatar, null)

        const good = response()
        await freshController.updateAvatar({
            body: { imgurl: '/api/uploads/1792855300690-d500c6ec-1e5b-4c2c-886e-a6bcdd19d91f.jpg' },
            user: { userId: 7, user_type: 'normal' },
            ip: '127.0.0.1'
        }, good)
        assert.equal(good.body.code, 200)
        assert.equal(savedAvatar, good.body.data.imgurl)
    } finally {
        Module._load = originalLoad
        delete require.cache[controllerPath]
    }
})
