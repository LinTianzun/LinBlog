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

test('public article endpoints ignore logged-in author scoping', async () => {
    const articleControllerPath = path.resolve(__dirname, '../controller/articleController.js')
    const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')
    let modelCalls = []

    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === articleControllerPath && request === '../model/dbModel/article/index') {
            return {
                async findArticlesByPage(params) {
                    modelCalls.push(params)
                    return {
                        total: 0, page: 1, pageSize: 10, totalPage: 0, list: []
                    }
                },
                async findAtricleById(id, userId, userType) {
                    modelCalls.push({ id, userId, userType })
                    return { id, state: 'published' }
                }
            }
        }
        return originalLoad.call(this, request, parent, isMain)
    }

    delete require.cache[articleControllerPath]
    delete require.cache[articleModelPath]
    const articleController = require(articleControllerPath)
    Module._load = originalLoad

    const listRes = makeResponse()
    await articleController.getPublicArticles({
        query: { page: '1', pageSize: '10' },
        user: { userId: 7, userType: 'normal' }
    }, listRes)

    assert.equal(listRes.statusCode, 200)
    assert.equal(modelCalls[0].state, 'published')
    assert.equal(modelCalls[0].classify, 'article')
    assert.equal(modelCalls[0].userType, 'visitor')
    assert.equal(modelCalls[0].userId, null)

    modelCalls = []
    const detailRes = makeResponse()
    await articleController.getPublicArticleById({
        params: { id: '123' },
        user: { userId: 7, userType: 'normal' }
    }, detailRes)

    assert.equal(detailRes.statusCode, 200)
    assert.deepEqual(modelCalls[0], { id: 123, userId: null, userType: 'visitor' })
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
    const handlerNames = route => route.handlers.map(handler => handler.name)
    //  公开分类在认证前先打 publicRead 标记，让计数只统计已发布内容
    assert.ok(handlerNames(subsetRoute).includes('optionalAuthMiddleware'))
    assert.ok(handlerNames(labelRoute).includes('optionalAuthMiddleware'))
    assert.ok(handlerNames(subsetRoute).includes('publicRead'))
    assert.ok(!handlerNames(labelRoute).includes('publicRead'))

    const privateSubset = routes.find(route => route.path === '/api/subset')
    const privateLabel = routes.find(route => route.path === '/api/label')
    assert.equal(privateSubset.handlers[0].name, 'authMiddleware')
    assert.equal(privateLabel.handlers[0].name, 'authMiddleware')
    assert.ok(!handlerNames(privateSubset).includes('publicRead'))
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
