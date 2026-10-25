const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const overviewController = require(path.resolve(__dirname, '../controller/overviewController.js'))
const recordModel = require(path.resolve(__dirname, '../model/dbModel/record/index.js'))

function createRes() {
    return {
        statusCode: 0,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.body = payload
            return this
        }
    }
}

test('getVisitStats fills consecutive date axis and maps distribution', async () => {
    const originalDay = recordModel.countRecordsByDay
    const originalField = recordModel.countRecordsByField
    const dayLabel = (offset) => {
        const d = new Date(Date.now() - offset * 24 * 60 * 60 * 1000)
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const sixDaysAgo = dayLabel(6)
    const yesterday = dayLabel(1)

    recordModel.countRecordsByDay = async (days) => {
        assert.equal(days, 7)
        // 只返回两天有数据，其余日期应由控制器补 0
        return [
            { date: sixDaysAgo, count: 5 },
            { date: yesterday, count: 12 },
        ]
    }
    recordModel.countRecordsByField = async (field, days) => {
        assert.ok(field === 'device' || field === 'os')
        assert.equal(days, 7)
        if (field === 'device') {
            return [
                { label: '桌面端', value: 11 },
                { label: '移动端', value: 6 },
            ]
        }
        return [
            { label: 'Windows', value: 9 },
            { label: 'iOS', value: 8 },
        ]
    }

    try {
        const res = createRes()
        await overviewController.getVisitStats({ query: { period: 'week' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.visit.length, 7)
        assert.deepEqual(res.body.data.visit[0], { date: sixDaysAgo, count: 5 })
        assert.equal(res.body.data.visit[2].count, 0)
        assert.deepEqual(res.body.data.visit[5], { date: yesterday, count: 12 })
        assert.deepEqual(res.body.data.visit[6], { date: dayLabel(0), count: 0 })
        assert.deepEqual(res.body.data.device[0], { key: '桌面端', name: '桌面端', value: 11 })
        assert.deepEqual(res.body.data.website[1], { key: 'iOS', name: 'iOS', value: 8 })
    } finally {
        recordModel.countRecordsByDay = originalDay
        recordModel.countRecordsByField = originalField
    }
})

test('getVisitStats supports month period', async () => {
    const originalDay = recordModel.countRecordsByDay
    const originalField = recordModel.countRecordsByField
    let receivedDays = 0

    recordModel.countRecordsByDay = async (days) => {
        receivedDays = days
        return []
    }
    recordModel.countRecordsByField = async () => []

    try {
        const res = createRes()
        await overviewController.getVisitStats({ query: { period: 'moon' } }, res)

        assert.equal(res.body.code, 200)
        assert.equal(receivedDays, 30)
        assert.equal(res.body.data.visit.length, 30)
        assert.ok(res.body.data.visit.every((item) => item.count === 0))
    } finally {
        recordModel.countRecordsByDay = originalDay
        recordModel.countRecordsByField = originalField
    }
})

test('getVisitStats returns 500 when record queries fail', async () => {
    const originalDay = recordModel.countRecordsByDay
    recordModel.countRecordsByDay = async () => {
        throw new Error('connection lost')
    }

    try {
        const res = createRes()
        await overviewController.getVisitStats({ query: {} }, res)

        assert.equal(res.statusCode, 500)
        assert.equal(res.body.code, 500)
        assert.match(res.body.message, /访问统计查询失败/)
    } finally {
        recordModel.countRecordsByDay = originalDay
    }
})

test('record middleware writes parsed UA and skips public auth paths', async () => {
    const recordMiddleware = require(path.resolve(__dirname, '../middleware/record.js'))
    const writes = []
    const model = require(path.resolve(__dirname, '../model/dbModel/record/index.js'))
    const originalCreate = model.createRecord
    model.createRecord = async (payload) => {
        writes.push(payload)
        return { insertId: 1 }
    }

    const run = (req) => new Promise((resolve) => {
        recordMiddleware(req, {}, () => resolve())
    })

    try {
        await run({
            path: '/api/article',
            ip: '127.0.0.1',
            user: { userId: 7 },
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36'
            },
        })
        await run({ path: '/api/user/login', ip: '127.0.0.1', headers: {} })

        assert.equal(writes.length, 1)
        assert.equal(writes[0].userId, 7)
        assert.equal(writes[0].device, '桌面端')
        assert.equal(writes[0].browser, 'Chrome')
        assert.equal(writes[0].os, 'Windows')
        assert.equal(writes[0].path, '/api/article')
    } finally {
        model.createRecord = originalCreate
    }
})
