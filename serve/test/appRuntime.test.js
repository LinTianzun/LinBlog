const assert = require('node:assert/strict')
const test = require('node:test')

const express = require('express')

const { FRONTEND_SECURITY_POLICY, applyFrontendSecurityPolicy } = require('../middleware/frontendCsp')
const { securityHeaders } = require('../middleware/security')

test('前端响应使用可用 CSP，接口响应保持严格策略', async () => {
    const app = express()
    app.use(securityHeaders())
    app.get('/api/ping', (req, res) => res.json({ code: 200 }))
    app.get('/portal', (req, res) => {
        applyFrontendSecurityPolicy(res)
        res.type('html').send('<!doctype html><html></html>')
    })

    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`

    try {
        const api = await fetch(`${origin}/api/ping`)
        assert.match(api.headers.get('content-security-policy'), /default-src 'none'/)

        const page = await fetch(`${origin}/portal`)
        const pagePolicy = page.headers.get('content-security-policy')
        assert.equal(pagePolicy, FRONTEND_SECURITY_POLICY)
        assert.match(pagePolicy, /script-src 'self'/)
        assert.match(pagePolicy, /img-src 'self' data: blob:/)
        assert.doesNotMatch(pagePolicy, /default-src 'none'/)
    } finally {
        await new Promise((resolve) => {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
            server.close(resolve)
        })
    }
})
