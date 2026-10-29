const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/message/index.js')
const originalLoad = Module._load
let calls = []

const query = async (sql, params = []) => {
    calls.push({ sql, params })

    if (sql.includes("user_type = 'admin'")) return [{ id: 1 }]
    if (sql.includes('SELECT id FROM users WHERE id = ? AND status = 1')) return [{ id: 1 }]
    if (sql.includes('COUNT(*) AS total FROM message')) return [{ total: 0 }]
    return []
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath && request === '../../db/dbnew') {
        return { query }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const messageModel = require(modelPath)
Module._load = originalLoad

test.beforeEach(() => {
    calls = []
})

test('直接私信写入 direct 渠道，不进入门户留言墙', async () => {
    await messageModel.insertMessage(
        { receiverId: 2, type: 'private', content: 'hello' },
        3
    )

    const insert = calls.find(call => call.sql.includes('INSERT INTO message'))
    assert.ok(insert.sql.includes("'direct'"))
    assert.deepEqual(insert.params, [3, 2, 'private', 'hello'])
})

test('门户留言写入 wall 渠道', async () => {
    await messageModel.insertWallMessage('portal hello', 3)

    const insert = calls.find(call => call.sql.includes('INSERT INTO message'))
    assert.ok(insert.sql.includes("'wall'"))
    assert.deepEqual(insert.params, [3, 1, 'portal hello'])
})

test('门户留言墙列表与总数都只统计 wall 渠道', async () => {
    await messageModel.getWallMessages({ page: 1, pageSize: 10, offset: 0 })

    const wallQueries = calls.filter(call =>
        call.sql.includes('FROM message')
        && call.sql.includes('receiver_id = ?')
    )
    assert.equal(wallQueries.length, 2)
    assert.ok(wallQueries.every(call => call.sql.includes("channel = 'wall'")))
})
