const assert = require('node:assert/strict')
const express = require('express')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = process.env.LINBLOG_JWT_SECRET || 'test-secret'

const timeController = require('../controller/timeController')

function createApp() {
    const app = express()
    require('../routes/time')(app)
    return app
}

async function request(app, path) {
    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const port = server.address().port
    try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`)
        const body = await res.json()
        return { status: res.status, headers: res.headers, body }
    } finally {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
    }
}

test('GET /api/time/now 返回服务器绝对时间与时区偏移', async () => {
    const before = Date.now()
    const { status, headers, body } = await request(createApp(), '/api/time/now')
    const after = Date.now()

    assert.equal(status, 200)
    assert.equal(body.code, 200)
    assert.equal(headers.get('cache-control'), 'no-store')

    const serverMs = new Date(body.data.now).getTime()
    assert.ok(Number.isFinite(serverMs), 'now 应是合法时间')
    assert.ok(serverMs >= before - 1000 && serverMs <= after + 1000, 'now 应接近当前时间')

    const offset = Number(body.data.offsetMinutes)
    assert.ok(Number.isInteger(offset), 'offsetMinutes 应是整数')
    assert.ok(offset >= -720 && offset <= 840, 'offsetMinutes 应在合理范围')

    // 偏移必须与运行进程时区一致，前端据此解析 datetime-local
    assert.equal(offset, -new Date().getTimezoneOffset())
    assert.equal(typeof body.data.timeZone, 'string')
})

test('GET /api/time/now 不需要登录即可访问', async () => {
    const { status, body } = await request(createApp(), '/api/time/now')
    assert.equal(status, 200)
    assert.equal(body.code, 200)
})
