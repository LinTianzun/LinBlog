const assert = require('node:assert/strict')
const express = require('express')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const { sameOrigin, originFromHeaders } = require('../middleware/sameOrigin')
const config = require('../config/default')
const healthController = require('../controller/healthController')

function createApp() {
    const app = express()
    app.use(express.json())
    app.post('/write', sameOrigin, (req, res) => res.json({ ok: true }))
    return app
}

async function listen(app) {
    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    // 把测试 server origin 加入允许集，使同源请求能通过
    const originalOrigins = config.allowedOrigins
    config.allowedOrigins = [...originalOrigins, origin]
    return {
        origin,
        port: server.address().port,
        close: () => new Promise((resolve) => {
            config.allowedOrigins = originalOrigins
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
            server.close(resolve)
        }),
    }
}

// --- sameOrigin 中间件 ---

test('sameOrigin allows requests with matching Origin header', async () => {
    const app = createApp()
    const { origin, close } = await listen(app)
    try {
        const res = await fetch(`${origin}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: '{}',
        })
        assert.equal(res.status, 200)
        const body = await res.json()
        assert.equal(body.ok, true)
    } finally {
        await close()
    }
})

test('sameOrigin rejects requests with foreign Origin', async () => {
    const app = createApp()
    const { origin, close } = await listen(app)
    try {
        const res = await fetch(`${origin}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
            body: '{}',
        })
        assert.equal(res.status, 403)
        const body = await res.json()
        assert.equal(body.code, 403)
        assert.match(body.message, /来源不被允许/)
    } finally {
        await close()
    }
})

test('sameOrigin allows non-browser requests without Origin/Referer', async () => {
    const app = createApp()
    const { origin, close } = await listen(app)
    try {
        // curl 等非浏览器客户端不发送 Origin 或 Referer
        const res = await fetch(`${origin}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        })
        assert.equal(res.status, 200)
    } finally {
        await close()
    }
})

test('sameOrigin accepts matching Referer when Origin absent', async () => {
    const app = createApp()
    const { origin, close } = await listen(app)
    try {
        const res = await fetch(`${origin}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Referer: `${origin}/portal` },
            body: '{}',
        })
        assert.equal(res.status, 200)
    } finally {
        await close()
    }
})

test('originFromHeaders extracts origin from Referer', () => {
    const req = { headers: { referer: 'https://blog.example.com/article/1' } }
    assert.equal(originFromHeaders(req), 'https://blog.example.com')
})

test('originFromHeaders returns null when no Origin or Referer', () => {
    const req = { headers: {} }
    assert.equal(originFromHeaders(req), null)
})

// --- healthController ---

test('liveness always returns 200 ok', async () => {
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(p) { this.body = p; return this } }
    await healthController.liveness({}, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.status, 'ok')
})

test('readiness returns 200 when database ping succeeds', async () => {
    const db = require('../model/db/dbnew')
    const originalQuery = db.query
    db.query = async () => [{ '1': 1 }]
    try {
        healthController.resetPingCache()
        const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(p) { this.body = p; return this } }
        await healthController.readiness({}, res)
        assert.equal(res.statusCode, 200)
        assert.equal(res.body.status, 'ready')
        assert.equal(res.body.checks.database, 'ok')
    } finally {
        db.query = originalQuery
    }
})

test('readiness returns 503 when database ping fails', async () => {
    const db = require('../model/db/dbnew')
    const originalQuery = db.query
    db.query = async () => { throw new Error('connection lost') }
    try {
        const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(p) { this.body = p; return this } }
        // 重置缓存使下一次 ping 强制走 DB
        healthController.resetPingCache()
        await healthController.readiness({}, res)
        assert.equal(res.statusCode, 503)
        assert.equal(res.body.status, 'not_ready')
        assert.equal(res.body.checks.database, 'fail')
    } finally {
        db.query = originalQuery
    }
})

test('runtimeInfo returns 403 without systemLog.view permission', async () => {
    const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(p) { this.body = p; return this } }
    await healthController.runtimeInfo({ user: { userId: 1, permissions: [] } }, res)
    assert.equal(res.statusCode, 403)
})

test('runtimeInfo returns runtime data with systemLog.view permission', async () => {
    const db = require('../model/db/dbnew')
    const originalGetPool = db.getPool
    db.getPool = () => ({ _allConnections: [], _freeConnections: [], _connectionQueue: [] })
    try {
        const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(p) { this.body = p; return this } }
        await healthController.runtimeInfo({ user: { userId: 1, permissions: ['systemLog.view'] } }, res)
        assert.equal(res.statusCode, 200)
        assert.equal(res.body.code, 200)
        assert.ok(typeof res.body.data.uptime === 'number')
        assert.ok(res.body.data.memory)
        assert.ok(res.body.data.pool)
        assert.ok(res.body.data.config.connectionLimit > 0)
    } finally {
        db.getPool = originalGetPool
    }
})
