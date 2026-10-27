const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const userController = require(path.resolve(__dirname, '../controller/userController.js'))
const userModel = require(path.resolve(__dirname, '../model/dbModel/users/index.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        }
    }
}

test('register rejects duplicate username before hashing password', async () => {
    const originalMail = userModel.findUserByMail
    const originalName = userModel.findUserByUsername
    let hashed = false

    userModel.findUserByMail = async () => []
    userModel.findUserByUsername = async () => [{ id: 9, username: '张三' }]
    const bcrypt = require('bcrypt')
    const originalHash = bcrypt.hash
    bcrypt.hash = async () => {
        hashed = true
        return 'x'
    }

    try {
        const res = createRes()
        await userController.register({ body: { username: '张三', mail: 'z@t.cn', password: '123456' } }, res)

        assert.equal(res.statusCode, 400)
        assert.equal(res.body.code, 400)
        assert.equal(res.body.message, '该用户名已被注册')
        assert.equal(hashed, false)
    } finally {
        userModel.findUserByMail = originalMail
        userModel.findUserByUsername = originalName
        bcrypt.hash = originalHash
    }
})

async function registerAfterPassingPrechecks(insertUser) {
    const originalMail = userModel.findUserByMail
    const originalName = userModel.findUserByUsername
    const originalInsert = userModel.insertUser
    const bcrypt = require('bcrypt')
    const originalGenSalt = bcrypt.genSalt
    const originalHash = bcrypt.hash

    userModel.findUserByMail = async () => []
    userModel.findUserByUsername = async () => []
    userModel.insertUser = insertUser
    bcrypt.genSalt = async () => 'test-salt'
    bcrypt.hash = async () => 'hashed-password'

    try {
        const res = createRes()
        await userController.register({
            body: { username: '并发用户', mail: 'race@example.com', password: '123456' }
        }, res)
        return res
    } finally {
        userModel.findUserByMail = originalMail
        userModel.findUserByUsername = originalName
        userModel.insertUser = originalInsert
        bcrypt.genSalt = originalGenSalt
        bcrypt.hash = originalHash
    }
}

test('register maps a concurrent mail unique-key conflict to 400', async () => {
    const res = await registerAfterPassingPrechecks(async () => {
        const err = new Error("Duplicate entry 'race@example.com' for key 'users.uk_mail'")
        err.code = 'ER_DUP_ENTRY'
        err.errno = 1062
        throw err
    })

    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 400)
    assert.equal(res.body.message, '该邮箱已被注册')
})

test('register maps a concurrent username unique-key conflict to 400', async () => {
    const res = await registerAfterPassingPrechecks(async () => {
        const err = new Error("Duplicate entry '并发用户' for key 'users.uk_username'")
        err.code = 'ER_DUP_ENTRY'
        err.errno = 1062
        throw err
    })

    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 400)
    assert.equal(res.body.message, '该用户名已被注册')
})

test('register keeps a useful conflict response for an unclassified duplicate key', async () => {
    const res = await registerAfterPassingPrechecks(async () => {
        const err = new Error('Duplicate entry detected')
        err.code = 'ER_DUP_ENTRY'
        throw err
    })

    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 400)
    assert.equal(res.body.message, '该用户名或邮箱已被注册')
})
