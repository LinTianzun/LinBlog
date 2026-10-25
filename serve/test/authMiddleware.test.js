const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const authPath = path.resolve(__dirname, '../middleware/auth.js')
const originalLoad = Module._load
let accountStatus = 1
let findUserError = null
let userExists = true

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === authPath && request === '../utils/jwtutil') {
        return { verifyToken: () => ({ userId: 7 }) }
    }
    if (parent && parent.filename === authPath && request === '../model/dbModel/users/index') {
        return {
            async findUserById() {
                if (findUserError) throw findUserError
                return userExists ? [{ id: 7, user_type: 'normal', status: accountStatus }] : []
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const { authMiddleware } = require(authPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

test.beforeEach(() => { accountStatus = 1; findUserError = null; userExists = true })

test('missing or empty token is rejected with 401', async () => {
    const res = makeResponse()
    let nextCalled = false
    await authMiddleware({ headers: {} }, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 401)
    assert.equal(nextCalled, false)
})

test('database failures during authentication return 503 instead of 401', async () => {
    findUserError = new Error('connection lost')
    const res = makeResponse()
    let nextCalled = false
    await authMiddleware({ headers: { authorization: 'Bearer valid-token' } }, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 503)
    assert.equal(nextCalled, false)
})

test('missing user is rejected with 401', async () => {
    userExists = false
    const res = makeResponse()
    let nextCalled = false
    await authMiddleware({ headers: { authorization: 'Bearer valid-token' } }, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 401)
    assert.equal(nextCalled, false)
})

test('valid token is rejected after the account is disabled', async () => {
    accountStatus = 0
    const res = makeResponse()
    let nextCalled = false
    await authMiddleware({ headers: { authorization: 'Bearer valid-token' } }, res, () => { nextCalled = true })
    // 当前 main 的实现：禁用账号返回 401 并提示联系管理员
    assert.equal(res.statusCode, 401)
    assert.equal(nextCalled, false)
})

test('enabled account can continue through authentication', async () => {
    accountStatus = 1
    const res = makeResponse()
    let nextCalled = false
    const req = { headers: { authorization: 'Bearer valid-token' } }
    await authMiddleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(req.user.userId, 7)
    assert.equal(req.user.userType, 'normal')
})
