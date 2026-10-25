const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const authPath = path.resolve(__dirname, '../middleware/auth.js')
const originalLoad = Module._load

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === authPath && request === '../utils/jwtutil') {
        return { verifyToken: () => ({ userId: 7 }) }
    }
    if (parent && parent.filename === authPath && request === '../model/dbModel/users/index') {
        return {
            async findUserById() {
                return [{ id: 7, user_type: 'normal', status: 1 }]
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const { optionalAuthMiddleware } = require(authPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}

test('public read endpoints mount optional auth and keep admin write endpoints strict', async () => {
    const withUser = { headers: { authorization: 'Bearer token' } }
    await optionalAuthMiddleware(withUser, makeResponse(), () => {})
    assert.equal(withUser.user.userId, 7)

    const anonymous = { headers: {} }
    await optionalAuthMiddleware(anonymous, makeResponse(), () => {})
    assert.deepEqual(anonymous.user, {
        userId: null,
        user_type: 'visitor',
        userType: 'visitor'
    })
})

test('article model scopes anonymous visitors to published content only', async () => {
    const calls = []
    const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')

    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === articleModelPath && request === '../../db/dbnew') {
            return { query: async (sql, values) => { calls.push({ sql, values }); return [] } }
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    const articleModel = require(articleModelPath)
    Module._load = originalLoad

    await articleModel.findArticlesByPage({
        page: 1, pageSize: 10, offset: 0,
        userId: null, userType: 'visitor'
    })
    assert.match(calls[0].sql, /a\.state = \?/)
    assert.equal(calls[0].values[1], 'published')

    calls.length = 0
    await articleModel.findAtricleById(123, null, 'visitor')
    assert.match(calls[0].sql, /a\.state = \?/)
    assert.equal(calls[0].values[2], 'published')
})
