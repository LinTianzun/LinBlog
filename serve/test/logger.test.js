const assert = require('node:assert/strict')
const test = require('node:test')

const { logger, redact } = require('../utils/logger')
const { createRequestLogger } = require('../middleware/security')

function captureConsole() {
    const original = { log: console.log, warn: console.warn, error: console.error }
    const lines = []
    console.log = (line) => lines.push(line)
    console.warn = (line) => lines.push(line)
    console.error = (line) => lines.push(line)
    return {
        lines,
        restore() {
            console.log = original.log
            console.warn = original.warn
            console.error = original.error
        }
    }
}

test('logger emits single-line JSON with level, context and error details', () => {
    const capture = captureConsole()
    try {
        const error = new Error('boom')
        error.code = 'E_TEST'
        logger.error('[Test] 写入失败', { userId: 7 }, error)
        logger.info('已启动')
    } finally {
        capture.restore()
    }

    assert.equal(capture.lines.length, 2)
    const payload = JSON.parse(capture.lines[0])
    assert.equal(payload.level, 'error')
    assert.equal(payload.message, '[Test] 写入失败')
    assert.equal(payload.meta.userId, 7)
    assert.equal(payload.error.message, 'boom')
    assert.equal(payload.error.code, 'E_TEST')
    assert.doesNotMatch(capture.lines[0], /\n/)

    assert.equal(JSON.parse(capture.lines[1]).level, 'info')
})

test('logger redacts secrets and tolerates plain string context', () => {
    assert.deepEqual(
        redact({ token: 'abc', nested: { password: 'pw', title: 'ok' } }),
        { token: 'REDACTED', nested: { password: 'REDACTED', title: 'ok' } }
    )

    const capture = captureConsole()
    try {
        logger.warn('AI 调用失败', 'timeout')
    } finally {
        capture.restore()
    }
    const payload = JSON.parse(capture.lines[0])
    assert.deepEqual(payload.meta, { value: 'timeout' })
    assert.equal(payload.error, undefined)
})

test('request logger writes structured fields and masks credentials', () => {
    const captured = []
    const loggerStub = {
        info: (message, meta) => captured.push({ message, meta }),
        warn: (message, meta) => captured.push({ message, meta }),
        error: (message, meta) => captured.push({ message, meta }),
    }
    const times = [100, 112]
    const req = {
        headers: {},
        requestId: 'req-12345678',
        method: 'GET',
        originalUrl: '/api/public/comment?token=secret',
        ip: '203.0.113.42',
        user: { userId: 9 },
    }
    const res = { statusCode: 200, once: (event, handler) => { res.finish = handler } }

    createRequestLogger({ logger: loggerStub, now: () => times.shift() })(req, res, () => {})
    res.statusCode = 500
    res.finish()

    assert.equal(captured.length, 1)
    assert.equal(captured[0].meta.requestId, 'req-12345678')
    assert.equal(captured[0].meta.durationMs, 12)
    assert.equal(captured[0].meta.ip, '203.0.113.*')
    assert.match(captured[0].meta.path, /token=REDACTED/)
})
