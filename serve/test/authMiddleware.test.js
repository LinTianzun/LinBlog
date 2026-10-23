const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const middlewarePath = path.resolve(__dirname, '../middleware/auth.js')
const originalLoad = Module._load
let findUserError = null

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === middlewarePath) {
        if (request === '../utils/jwtutil') {
            return { verifyToken: () => ({ userId: 7 }) }
        }
        if (request === '../model/dbModel/users/index') {
            return {
                async findUserById() {
                    if (findUserError) throw findUserError
                    return [{ id: 7, user_type: 'normal', status: 1 }]
                }
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { authMiddleware } = require(middlewarePath)
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
    findUserError = null
})

test('database failures during authentication return 503 instead of 401', async () => {
    findUserError = new Error('connection lost')
    const res = makeResponse()
    let nextCalled = false

    await authMiddleware({
        headers: { authorization: 'Bearer valid-token' }
    }, res, () => {
        nextCalled = true
    })

    assert.equal(res.statusCode, 503)
    assert.equal(res.body.code, 503)
    assert.equal(nextCalled, false)
})

test('valid authenticated users can continue to the route handler', async () => {
    const req = {
        headers: { authorization: 'Bearer valid-token' }
    }
    const res = makeResponse()
    let nextCalled = false

    await authMiddleware(req, res, () => {
        nextCalled = true
    })

    assert.equal(nextCalled, true)
    assert.equal(req.user.userId, 7)
    assert.equal(req.user.userType, 'normal')
})
