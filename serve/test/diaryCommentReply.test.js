const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/diaryInteraction/index.js')
const originalLoad = Module._load

// 用脚本化 query 驱动 createComment，覆盖两级归一化的全部路径
let calls = []
let script = null

const fakeDb = {
    async query(sql, values = []) {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), values })
        if (script) return script(sql, values)
        return []
    },
    async withTransaction(fn) {
        // 模型内部用 connection.query 构造 run，这里模拟同样的接口
        const connection = {
            query(sql, values, cb) {
                fakeDb.query(sql, values).then(result => cb(null, result), err => cb(err))
            }
        }
        return fn(connection)
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath && request === '../../db/dbnew') {
        return fakeDb
    }
    return originalLoad.call(this, request, parent, isMain)
}

const model = require(modelPath)
Module._load = originalLoad

function stubDiaryAndInsert(insertId = 1) {
    script = (sql) => {
        if (sql.includes('FROM diary WHERE')) return [{ id: 3 }]
        if (sql.includes('INSERT INTO diary_comment')) return { insertId }
        return { affectedRows: 1 }
    }
}

test.beforeEach(() => {
    calls = []
    script = null
})

test('一级评论 parent_id 落 0 且不写回复目标', async () => {
    stubDiaryAndInsert()
    await model.createComment({ diaryId: 3, userId: 7, content: '一级' })

    const insert = calls.find(call => call.sql.includes('INSERT INTO diary_comment'))
    assert.deepEqual(insert.values, [7, 3, 0, null, null, '一级'])
})

test('回复一级评论：根评论即目标，replyTo 指向目标', async () => {
    stubDiaryAndInsert()
    script = (sql) => {
        if (sql.includes('FROM diary WHERE')) return [{ id: 3 }]
        if (sql.includes('FROM diary_comment') && sql.includes('LIMIT 1')) {
            return [{ id: 12, user_id: 8, parent_id: 0 }]
        }
        if (sql.includes('INSERT INTO diary_comment')) return { insertId: 2 }
        return { affectedRows: 1 }
    }
    await model.createComment({ diaryId: 3, userId: 7, content: '回复一级', parentId: 12 })

    const insert = calls.find(call => call.sql.includes('INSERT INTO diary_comment'))
    assert.deepEqual(insert.values, [7, 3, 12, 12, 8, '回复一级'])
})

test('回复二级评论：归一到根评论，replyTo 仍指向实际目标', async () => {
    stubDiaryAndInsert()
    script = (sql) => {
        if (sql.includes('FROM diary WHERE')) return [{ id: 3 }]
        if (sql.includes('FROM diary_comment') && sql.includes('LIMIT 1')) {
            return [{ id: 13, user_id: 9, parent_id: 12 }]
        }
        if (sql.includes('INSERT INTO diary_comment')) return { insertId: 3 }
        return { affectedRows: 1 }
    }
    const result = await model.createComment({ diaryId: 3, userId: 7, content: '回复二级', parentId: 13 })

    assert.equal(result.commentId, 3)
    const insert = calls.find(call => call.sql.includes('INSERT INTO diary_comment'))
    assert.deepEqual(insert.values, [7, 3, 12, 13, 9, '回复二级'])
})

test('回复目标不存在或属于其他随笔时返回 invalidParent', async () => {
    stubDiaryAndInsert()
    script = (sql) => {
        if (sql.includes('FROM diary WHERE')) return [{ id: 3 }]
        return []
    }
    const missing = await model.createComment({ diaryId: 3, userId: 7, content: 'x', parentId: 999 })
    assert.deepEqual(missing, { invalidParent: true })
    assert.ok(!calls.some(call => call.sql.includes('INSERT INTO diary_comment')))
})

test('随笔不存在时仍返回 null，不检查父评论', async () => {
    script = () => []
    const result = await model.createComment({ diaryId: 999, userId: 7, content: 'x' })
    assert.equal(result, null)
})
