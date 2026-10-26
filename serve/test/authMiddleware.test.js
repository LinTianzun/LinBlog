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
const { authMiddleware, optionalAuthMiddleware, authMiddlewareFromQuery } = require(authPath)
Module._load = originalLoad
const { issueUploadTicket, _reset, _size } = require(path.resolve(__dirname, '../utils/uploadTicket.js'))

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

test('optional auth falls back to visitor when token is missing', async () => {
    const req = { headers: {} }
    const res = makeResponse()
    let nextCalled = false
    await optionalAuthMiddleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(req.user, { userId: null, user_type: 'visitor', userType: 'visitor' })
})

test('optional auth still rejects disabled accounts', async () => {
    accountStatus = 0
    const req = { headers: { authorization: 'Bearer valid-token' } }
    const res = makeResponse()
    let nextCalled = false
    await optionalAuthMiddleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 401)
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

// ---- 上传接口的 query 认证：凭证必须走短期票据，而不是长期 JWT ----

test.beforeEach(() => { _reset() })

test('upload auth rejects a request with no ticket', async () => {
    const res = makeResponse()
    let nextCalled = false
    await authMiddlewareFromQuery({ headers: {}, query: {} }, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.body.code, 401)
    // yk-upload 只处理 200，失败也要用 200 + error 字段回传
    assert.equal(res.statusCode, 200)
})

test('upload auth rejects a long-lived JWT passed instead of a ticket', async () => {
    // 旧客户端把登录 token 拼在 URL 上；现在只认票据，长期 JWT 一律不收
    const res = makeResponse()
    let nextCalled = false
    await authMiddlewareFromQuery(
        { headers: {}, query: { token: 'legacy-long-lived-jwt' } },
        res,
        () => { nextCalled = true }
    )
    assert.equal(nextCalled, false)
    assert.equal(res.body.code, 401)
})

test('upload auth authenticates from the ticket alone, with no Authorization header', async () => {
    // yk-upload 的 XHR 不带请求头，票据必须自带身份
    const { ticket } = issueUploadTicket(7)
    const req = { headers: {}, query: { ticket } }
    const res = makeResponse()
    let nextCalled = false
    await authMiddlewareFromQuery(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(req.user.userId, 7)
    assert.equal(req.user.userType, 'normal')
})

test('upload auth rejects a disabled account even with a valid ticket', async () => {
    accountStatus = 0
    const { ticket } = issueUploadTicket(7)
    const res = makeResponse()
    let nextCalled = false
    await authMiddlewareFromQuery(
        { headers: {}, query: { ticket } },
        res,
        () => { nextCalled = true }
    )
    assert.equal(nextCalled, false)
    assert.equal(res.body.code, 401)
})

test('upload auth rejects a replayed ticket that was already consumed', async () => {
    const { ticket } = issueUploadTicket(7, { uses: 1 })
    const first = makeResponse()
    await authMiddlewareFromQuery({ headers: {}, query: { ticket } }, first, () => {})

    const replay = makeResponse()
    let nextCalled = false
    await authMiddlewareFromQuery(
        { headers: {}, query: { ticket } },
        replay,
        () => { nextCalled = true }
    )
    assert.equal(nextCalled, false)
    assert.equal(replay.body.code, 401)
    assert.equal(_size(), 0, '用尽的票据不应留在池里')
})
