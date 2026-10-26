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
            return { query: async (sql, values) => { calls.push({ sql, values }); return [{ total: 0 }] } }
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

test('public subset and label routes mount optional auth', () => {
    const express = require('express')
    const app = express()
    const routes = []
    app.get = (path, ...handlers) => {
        routes.push({ method: 'get', path, handlers })
        return app
    }

    require('../routes/subset')(app)
    require('../routes/label')(app)

    const subsetRoute = routes.find(route => route.path === '/api/public/subset')
    const labelRoute = routes.find(route => route.path === '/api/public/label')
    assert.ok(subsetRoute, 'missing public subset route')
    assert.ok(labelRoute, 'missing public label route')
    assert.equal(subsetRoute.handlers[0].name, 'optionalAuthMiddleware')
    assert.equal(labelRoute.handlers[0].name, 'optionalAuthMiddleware')

    const privateSubset = routes.find(route => route.path === '/api/subset')
    const privateLabel = routes.find(route => route.path === '/api/label')
    assert.equal(privateSubset.handlers[0].name, 'authMiddleware')
    assert.equal(privateLabel.handlers[0].name, 'authMiddleware')
})

test('public diary route mounts optional auth and private diary routes stay strict', () => {
    const express = require('express')
    const app = express()
    const routes = []
    const originalGet = app.get
    app.get = (path, ...handlers) => {
        routes.push({ method: 'get', path, handlers })
        return app
    }

    require('../routes/diary')(app)
    app.get = originalGet

    const publicDiary = routes.find(route => route.path === '/api/public/diary')
    assert.ok(publicDiary, 'missing public diary route')
    assert.equal(publicDiary.handlers[0].name, 'optionalAuthMiddleware')

    const privateDiary = routes.find(route => route.path === '/api/diary')
    assert.equal(privateDiary.handlers[0].name, 'authMiddleware')
})
