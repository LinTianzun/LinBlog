const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const express = require('express')
const test = require('node:test')

const {
    redactUrl,
    maskIp,
    requestContext,
    securityHeaders,
    permissionsPolicy,
    createRequestLogger,
} = require('../middleware/security')
const { notFoundHandler, createErrorHandler } = require('../middleware/errorHandler')
const { createGracefulShutdown } = require('../utils/gracefulShutdown')
const {
    registerLimit,
    loginLimit,
    commentWriteLimit,
    reportLimit,
    uploadLimit,
    uploadTicketLimit,
    interactionLimit,
    publicMessageLimit,
} = require('../middleware/rateLimit')

async function listen(app) {
    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    return {
        origin,
        close: () => new Promise((resolve) => {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
            server.close(resolve)
        }),
    }
}

test('request logs redact credentials and mask client addresses', () => {
    assert.equal(
        redactUrl('/api/user/password/reset?token=abc123'),
        '/api/user/password/reset?token=REDACTED'
    )
    assert.equal(maskIp('203.0.113.42'), '203.0.113.*')
    assert.equal(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:*')

    const messages = []
    const logger = {
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message),
        error: (message) => messages.push(message),
    }
    const req = {
        headers: {},
        method: 'POST',
        originalUrl: '/api/upload/image?ticket=plain-ticket&token=jwt-value',
        ip: '198.51.100.23',
        user: { userId: 7 },
    }
    const res = new EventEmitter()
    res.statusCode = 201
    res.setHeader = () => {}

    requestContext(req, res, () => {})
    const times = [100, 112]
    createRequestLogger({ logger, now: () => times.shift() })(req, res, () => {})
    res.emit('finish')

    assert.equal(messages.length, 1)
    assert.match(messages[0], /ticket=REDACTED/)
    assert.match(messages[0], /token=REDACTED/)
    assert.match(messages[0], /ip=198\.51\.100\.\*/)
    assert.match(messages[0], /user=7/)
    assert.doesNotMatch(messages[0], /plain-ticket|jwt-value|198\.51\.100\.23/)
})

test('security headers and unified errors are returned consistently', async () => {
    const app = express()
    app.use(requestContext)
    app.use(securityHeaders())
    app.use(permissionsPolicy)
    app.use(express.json({ limit: '64b' }))
    app.post('/api/echo', (req, res) => res.json({ code: 200, data: req.body }))
    app.use(notFoundHandler)
    app.use(createErrorHandler({
        logger: { warn() {}, error() {} },
    }))

    const running = await listen(app)
    try {
        const ok = await fetch(`${running.origin}/api/echo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ok: true }),
        })
        assert.equal(ok.status, 200)
        assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
        assert.equal(ok.headers.get('x-frame-options'), 'SAMEORIGIN')
        assert.equal(ok.headers.get('referrer-policy'), 'no-referrer')
        assert.match(ok.headers.get('content-security-policy'), /default-src 'none'/)
        assert.equal(ok.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
        assert.ok(ok.headers.get('x-request-id'))
        assert.equal(ok.headers.get('x-powered-by'), null)

        const malformed = await fetch(`${running.origin}/api/echo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"broken":',
        })
        assert.equal(malformed.status, 400)
        const malformedBody = await malformed.json()
        assert.equal(malformedBody.code, 400)
        assert.ok(malformedBody.requestId)

        const missing = await fetch(`${running.origin}/api/missing`)
        assert.equal(missing.status, 404)
        assert.deepEqual(await missing.json(), {
            code: 404,
            message: '接口不存在',
            requestId: missing.headers.get('x-request-id'),
        })
    } finally {
        await running.close()
    }
})

test('public write routes mount dedicated rate limiters', () => {
    const expressApp = express()
    const routes = []
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        expressApp[method] = (path, ...handlers) => {
            routes.push({ method, path, handlers })
            return expressApp
        }
    }

    for (const modulePath of [
        '../routes/user',
        '../routes/comment',
        '../routes/upload',
        '../routes/file',
        '../routes/ticket',
        '../routes/praise',
        '../routes/diaryInteraction',
        '../routes/view',
        '../routes/message',
    ]) {
        require(modulePath)(expressApp)
    }

    const handler = (method, path) => routes.find(
        (route) => route.method === method && route.path === path
    )?.handlers || []

    assert.ok(handler('post', '/api/user/register').includes(registerLimit))
    assert.ok(handler('post', '/api/user/login').includes(loginLimit))
    assert.ok(handler('post', '/api/public/comment').includes(commentWriteLimit))
    assert.ok(handler('post', '/api/public/diary/comment').includes(commentWriteLimit))
    assert.ok(handler('post', '/api/public/comment/report').includes(reportLimit))
    assert.ok(handler('post', '/api/public/comment/like').includes(interactionLimit))
    assert.ok(handler('post', '/api/public/praise/:id').includes(interactionLimit))
    assert.ok(handler('post', '/api/public/diary/praise/:id').includes(interactionLimit))
    assert.ok(handler('post', '/api/public/view').includes(interactionLimit))
    assert.ok(handler('post', '/api/upload/image').includes(uploadLimit))
    assert.ok(handler('post', '/api/file/upload').includes(uploadLimit))
    assert.ok(handler('post', '/api/upload/ticket').includes(uploadTicketLimit))
    assert.ok(handler('post', '/api/portal/message').includes(publicMessageLimit))
})

test('graceful shutdown stops tasks, closes HTTP and database once', async () => {
    const calls = []
    const exitCodes = []
    const server = {
        close(callback) {
            calls.push('server.close')
            callback()
        },
        closeIdleConnections() {
            calls.push('server.idle')
        },
    }

    const shutdown = createGracefulShutdown({
        server,
        cleanupTasks: [
            () => calls.push('cleanup:record'),
            () => calls.push('cleanup:file'),
        ],
        closeDatabase: async () => calls.push('database.close'),
        logger: { info() {}, error() {} },
        exit: (code) => exitCodes.push(code),
    })

    await shutdown('SIGTERM')
    await shutdown('SIGTERM')

    assert.deepEqual(calls, [
        'cleanup:record',
        'cleanup:file',
        'server.close',
        'server.idle',
        'database.close',
    ])
    assert.deepEqual(exitCodes, [0])
})
