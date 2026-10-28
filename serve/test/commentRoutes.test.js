const assert = require('node:assert/strict')
const express = require('express')
const test = require('node:test')

// 只关心路由挂载方式：收集 app 上注册的路径与首层中间件
function collectRoutes() {
    const app = express()
    const routes = []
    for (const method of ['get', 'post', 'delete', 'put', 'patch']) {
        const original = app[method].bind(app)
        app[method] = (routePath, ...handlers) => {
            routes.push({ method, path: routePath, handlers })
            return original(routePath, ...handlers)
        }
    }
    require('../routes/comment')(app)
    return routes
}

test('评论路由挂载：公开写操作走可选认证，后台写操作走强制认证', () => {
    const routes = collectRoutes()

    const find = (method, routePath) => routes.find(
        route => route.method === method && route.path === routePath
    )

    // 公开互动接口必须在 optionalAuth 下，否则匿名请求会直接 401
    for (const [method, routePath] of [
        ['get', '/api/public/comment'],
        ['post', '/api/public/comment'],
        ['post', '/api/public/comment/like'],
        ['post', '/api/public/comment/report'],
        ['post', '/api/public/comment/delete']
    ]) {
        const route = find(method, routePath)
        assert.ok(route, `缺少路由 ${method.toUpperCase()} ${routePath}`)
        assert.equal(route.handlers[0].name, 'optionalAuthMiddleware')
    }

    // 后台接口必须强制登录
    for (const [method, routePath] of [
        ['get', '/api/comment'],
        ['post', '/api/comment'],
        ['delete', '/api/comment/:id'],
        ['get', '/api/comment/my']
    ]) {
        const route = find(method, routePath)
        assert.ok(route, `缺少路由 ${method.toUpperCase()} ${routePath}`)
        assert.equal(route.handlers[0].name, 'authMiddleware')
    }
})

test('删除接口处理器按 commentType 分发，与点赞/举报复用同一控制器', () => {
    const routes = collectRoutes()
    const deleteRoute = routes.find(
        route => route.method === 'post' && route.path === '/api/public/comment/delete'
    )

    assert.equal(deleteRoute.handlers.length, 2)
    assert.equal(deleteRoute.handlers[1].name, 'deleteComment')
})
