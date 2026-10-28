const assert = require('node:assert/strict')
const test = require('node:test')

const { createRateLimit } = require('../middleware/rateLimit')

function request(ip = '127.0.0.1') {
    return { ip, socket: { remoteAddress: ip } }
}

function response() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name] = value },
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
    }
}

test('rate limit allows up to the configured maximum and then returns 429', () => {
    const limit = createRateLimit({
        windowMs: 60_000,
        max: 2,
        keyGenerator: req => req.ip,
    })

    let calls = 0
    for (let i = 0; i < 2; i += 1) {
        const res = response()
        limit(request(), res, () => { calls += 1 })
        assert.equal(res.statusCode, 200)
    }

    const blocked = response()
    let nextCalled = false
    limit(request(), blocked, () => { nextCalled = true })

    assert.equal(calls, 2)
    assert.equal(nextCalled, false)
    assert.equal(blocked.statusCode, 429)
    assert.equal(blocked.body.code, 429)
    assert.ok(Number(blocked.headers['Retry-After']) > 0)
})

test('rate limit buckets are isolated by key', () => {
    const limit = createRateLimit({
        windowMs: 60_000,
        max: 1,
        keyGenerator: req => req.ip,
    })

    const first = response()
    limit(request('10.0.0.1'), first, () => {})
    assert.equal(first.statusCode, 200)

    const second = response()
    let nextCalled = false
    limit(request('10.0.0.2'), second, () => { nextCalled = true })
    assert.equal(nextCalled, true)
})
