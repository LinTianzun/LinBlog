const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const controllerPath = path.resolve(__dirname, '../controller/passwordResetController.js')
const originalLoad = Module._load
let sentMail = []
let tokens = []
let consumed = []
let validRecord = null
let recentToken = null

const resetModel = {
    TOKEN_TTL_MINUTES: 30,
    async findUserForReset(mail) {
        return mail === 'user@example.com'
            ? [{ id: 7, username: '测试用户', mail, status: 1 }]
            : []
    },
    async findRecentToken() {
        return recentToken
    },
    async createResetToken(userId, ip) {
        tokens.push({ userId, ip })
        return 'a'.repeat(64)
    },
    async findValidToken() {
        return validRecord
    },
    async consumeResetToken(tokenId, userId, passwordHash) {
        consumed.push({ tokenId, userId, passwordHash })
        return true
    },
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/passwordReset/index') return resetModel
        if (request === '../utils/mailer') {
            return {
                async sendPasswordResetMail(payload) {
                    sentMail.push(payload)
                }
            }
        }
        if (request === '../utils/logHelper') return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const controller = require(controllerPath)
Module._load = originalLoad

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
    }
}

test.beforeEach(() => {
    sentMail = []
    tokens = []
    consumed = []
    validRecord = null
    recentToken = null
})

test('request returns the same generic response for unknown mail', async () => {
    const res = response()
    await controller.requestPasswordReset({ body: { mail: 'unknown@example.com' }, ip: '127.0.0.1' }, res)
    assert.equal(res.statusCode, 200)
    assert.match(res.body.message, /如果该邮箱已注册/)
    assert.equal(tokens.length, 0)
})

test('request creates a token and mails the reset link without exposing it', async () => {
    const res = response()
    await controller.requestPasswordReset({ body: { mail: 'USER@example.com' }, ip: '127.0.0.1' }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].userId, 7)
    assert.equal(sentMail.length, 1)
    assert.match(sentMail[0].resetUrl, /\/resetPassword\?token=a{64}$/)
    assert.equal(JSON.stringify(res.body).includes('a'.repeat(64)), false)
})

test('request suppresses a second mail inside the 60-second interval', async () => {
    recentToken = { id: 3 }
    const res = response()
    await controller.requestPasswordReset({ body: { mail: 'user@example.com' }, ip: '127.0.0.1' }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(tokens.length, 0)
    assert.equal(sentMail.length, 0)
})

test('validate rejects malformed or expired tokens', async () => {
    const res = response()
    await controller.validatePasswordResetToken({ query: { token: 'bad' } }, res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /无效或已过期/)
})

test('reset enforces an 8-character password before consuming the token', async () => {
    validRecord = { id: 2, user_id: 7, username: '测试用户' }
    const res = response()
    await controller.resetPassword({ body: { token: 'a'.repeat(64), newPassword: '1234567' } }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(consumed.length, 0)
})

test('reset consumes the token once and updates a bcrypt password hash', async () => {
    validRecord = { id: 2, user_id: 7, username: '测试用户' }
    const res = response()
    await controller.resetPassword({
        body: { token: 'a'.repeat(64), newPassword: 'new-password-123' },
        ip: '127.0.0.1',
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(consumed.length, 1)
    assert.equal(consumed[0].userId, 7)
    assert.match(consumed[0].passwordHash, /^\$2/)
})
