const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const systemLogModel = require(path.resolve(__dirname, '../model/dbModel/systemLog/index.js'))
const systemLogController = require(path.resolve(__dirname, '../controller/systemLogController.js'))
const { writeSystemLog } = require(path.resolve(__dirname, '../utils/logHelper.js'))

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

test('writeSystemLog normalizes payload and trims long detail', async () => {
    const originalInsert = systemLogModel.insertLog
    let captured = null

    systemLogModel.insertLog = async (payload) => {
        captured = payload
        return { insertId: 1 }
    }

    try {
        writeSystemLog({
            userId: 3,
            action: 'create',
            module: 'article',
            targetType: 'article',
            targetId: 12,
            detail: 'x'.repeat(600),
            ip: '127.0.0.1',
        })

        // 异步写入，让出事件循环等待
        await new Promise((resolve) => setImmediate(resolve))

        assert.ok(captured)
        assert.equal(captured.userId, 3)
        assert.equal(captured.action, 'create')
        assert.equal(captured.module, 'article')
        assert.equal(captured.targetId, 12)
        assert.equal(captured.detail.length, 500)
        assert.match(captured.detail, /\.\.\.$/)
    } finally {
        systemLogModel.insertLog = originalInsert
    }
})

test('writeSystemLog drops unknown action or module and never throws', async () => {
    const originalInsert = systemLogModel.insertLog
    let called = false

    systemLogModel.insertLog = async () => {
        called = true
        return { insertId: 1 }
    }

    try {
        writeSystemLog({ userId: 1, action: 'hack', module: 'user', detail: 'x' })
        writeSystemLog({ userId: 1, action: 'create', module: 'hacker', detail: 'x' })
        writeSystemLog(null)
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(called, false)
    } finally {
        systemLogModel.insertLog = originalInsert
    }
})

test('writeSystemLog survives model failure without throwing', async () => {
    const originalInsert = systemLogModel.insertLog
    systemLogModel.insertLog = async () => {
        throw new Error('connection lost')
    }

    try {
        assert.doesNotThrow(() => {
            writeSystemLog({ userId: 1, action: 'login', module: 'user', detail: 'x' })
        })
        await new Promise((resolve) => setImmediate(resolve))
    } finally {
        systemLogModel.insertLog = originalInsert
    }
})

test('getLogs rejects non-admin and formats list rows', async () => {
    const originalPage = systemLogModel.getLogsByPage

    try {
        const denied = createRes()
        await systemLogController.getLogs({ query: {}, user: { userId: 2, user_type: 'normal' } }, denied)
        assert.equal(denied.statusCode, 403)

        systemLogModel.getLogsByPage = async (params) => {
            assert.equal(params.module, 'article')
            assert.equal(params.action, 'publish')
            return {
                list: [{
                    id: 9, user_id: 1, username: '管理员', user_type: 'admin',
                    action: 'publish', module: 'article', target_type: 'article',
                    target_id: 3, detail: '文章状态变更为「已发布」', ip: '127.0.0.1',
                    created_at: '2026-10-25 12:00:00'
                }],
                total: 1
            }
        }

        const res = createRes()
        await systemLogController.getLogs({
            query: { page: '1', pageSize: '20', module: 'article', action: 'publish' },
            user: { userId: 1, user_type: 'admin' }
        }, res)

        assert.equal(res.body.code, 200)
        assert.equal(res.body.data.total, 1)
        assert.equal(res.body.data.list[0].username, '管理员')
        assert.equal(res.body.data.list[0].action, 'publish')
    } finally {
        systemLogModel.getLogsByPage = originalPage
    }
})

test('getLogs forwards desc by default and only allows asc when requested', async () => {
    const originalPage = systemLogModel.getLogsByPage
    const captured = []

    systemLogModel.getLogsByPage = async (params) => {
        captured.push(params.sortOrder)
        return { list: [], total: 0 }
    }

    try {
        await systemLogController.getLogs(
            { query: { page: '1' }, user: { userId: 1, user_type: 'admin' } },
            createRes()
        )
        await systemLogController.getLogs(
            { query: { page: '1', sortOrder: 'asc' }, user: { userId: 1, user_type: 'admin' } },
            createRes()
        )
        await systemLogController.getLogs(
            { query: { page: '1', sortOrder: '; DROP TABLE' }, user: { userId: 1, user_type: 'admin' } },
            createRes()
        )

        assert.deepEqual(captured, ['desc', 'asc', 'desc'])
    } finally {
        systemLogModel.getLogsByPage = originalPage
    }
})

test('getLogsByPage orders by created_at with the requested direction', async () => {
    const capturedSql = []
    const dbPath = path.resolve(__dirname, '../model/db/dbnew.js')
    const originalModule = require.cache[dbPath]

    //  模型在 require 时就解构了 query，只能整体替换模块来捕获 SQL
    delete require.cache[dbPath]
    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: {
            query: async (sql) => {
                capturedSql.push(sql)
                return sql.includes('COUNT(*)') ? [{ total: 0 }] : []
            }
        }
    }

    try {
        delete require.cache[path.resolve(__dirname, '../model/dbModel/systemLog/index.js')]
        const freshModel = require(path.resolve(__dirname, '../model/dbModel/systemLog/index.js'))

        await freshModel.getLogsByPage({ pageSize: 10, offset: 0, sortOrder: 'asc' })
        await freshModel.getLogsByPage({ pageSize: 10, offset: 0, sortOrder: 'desc' })

        const orderClauses = capturedSql.filter(sql => sql.includes('ORDER BY'))
        assert.equal(orderClauses.length, 2)
        assert.match(orderClauses[0], /ORDER BY l\.created_at ASC, l\.id ASC/)
        assert.match(orderClauses[1], /ORDER BY l\.created_at DESC, l\.id DESC/)
    } finally {
        delete require.cache[path.resolve(__dirname, '../model/dbModel/systemLog/index.js')]
        if (originalModule) require.cache[dbPath] = originalModule
        else delete require.cache[dbPath]
    }
})
