const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const authPath = path.resolve(__dirname, '../middleware/auth.js')
const originalLoad = Module._load
let accountStatus = 1

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === authPath && request === '../utils/jwtutil') {
        return { verifyToken: () => ({ userId: 7 }) }
    }
    if (parent && parent.filename === authPath && request === '../model/dbModel/users/index') {
        return { findUserById: async () => [{ id: 7, user_type: 'normal', status: accountStatus }] }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const { authMiddleware } = require(authPath)
Module._load = originalLoad

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

test('valid token is rejected after the account is disabled', async () => {
    accountStatus = 0
    const res = response()
    let nextCalled = false
    await authMiddleware({ headers: { authorization: 'Bearer valid-token' } }, res, () => { nextCalled = true })
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)
})

test('enabled account can continue through authentication', async () => {
    accountStatus = 1
    const res = response()
    let nextCalled = false
    const req = { headers: { authorization: 'Bearer valid-token' } }
    await authMiddleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(req.user.userId, 7)
})
