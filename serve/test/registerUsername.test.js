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
