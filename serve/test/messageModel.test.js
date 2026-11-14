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
    if (sql.includes('COUNT(*) AS count')) return [{ count: 0 }]
    if (sql.includes('COUNT(') && sql.includes('total') && sql.includes('FROM message')) {
        return [{ total: 0 }]
    }
    if (sql.includes('UPDATE message')) return { affectedRows: 2 }
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

test('直接私信写入 direct 来源标记', async () => {
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

test('门户留言墙展示所有留言和每位用户的首条私信', async () => {
    await messageModel.getWallMessages({ page: 1, pageSize: 10, offset: 0 })

    const wallQueries = calls.filter(call =>
        call.sql.includes('FROM message')
        && call.sql.includes('receiver_id = ?')
    )
    assert.equal(wallQueries.length, 2)
    assert.ok(wallQueries[0].sql.includes('MIN(id) AS first_id'))
    assert.ok(wallQueries[0].sql.includes('GROUP BY sender_id'))
    assert.ok(wallQueries.every(call => call.sql.includes("channel = 'wall'")))
    assert.ok(wallQueries.every(call => call.sql.includes('first_message.first_id IS NOT NULL')))
    assert.ok(wallQueries[1].sql.includes('COUNT(*) AS total'))
})

test('通知中心只查询系统消息与通知，并按范围统计未读', async () => {
    await messageModel.getInBoxMessages({
        page: 1,
        pageSize: 8,
        offset: 0,
        userId: 3,
        type: 'private',
        scope: 'notification',
    })

    const listCall = calls.find(call =>
        call.sql.includes('FROM message m') && call.sql.includes('LIMIT ? OFFSET ?')
    )
    assert.ok(listCall.sql.includes("type IN ('system', 'notice')"))
    assert.ok(!listCall.sql.includes('AND type = ?'))

    calls = []
    await messageModel.getUnreadCountByScope(3, '', 'notification')
    assert.ok(calls[0].sql.includes("type IN ('system', 'notice')"))
    assert.deepEqual(calls[0].params, [3])
})

test('全部已读只更新当前用户的未读系统消息与通知', async () => {
    const affected = await messageModel.markAllNotificationsRead(3)

    assert.equal(affected, 2)
    const update = calls.find(call => call.sql.includes('UPDATE message'))
    assert.ok(update.sql.includes("type IN ('system', 'notice')"))
    assert.deepEqual(update.params, [3])
})
