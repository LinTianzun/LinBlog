const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const helperPath = path.resolve(__dirname, '../utils/commentNotification.js')
const originalLoad = Module._load
let inserts = []

const messageModel = {
    async insertMessage(payload, senderId) {
        inserts.push({ payload, senderId })
        return { messageId: 1 }
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === helperPath && request === '../model/dbModel/message/index') {
        return messageModel
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { notifyComment } = require(helperPath)
Module._load = originalLoad

test.beforeEach(() => {
    inserts = []
})

test('评论通知写入 notice 类型并保留发送者', async () => {
    const result = await notifyComment({
        recipientId: 1,
        senderId: 2,
        content: '  你的文章收到一条新评论  ',
    })

    assert.equal(result.delivered, true)
    assert.deepEqual(inserts, [{
        payload: {
            receiverId: 1,
            type: 'notice',
            content: '你的文章收到一条新评论',
        },
        senderId: 2,
    }])
})

test('自己评论自己或收件人无效时不发通知', async () => {
    const self = await notifyComment({ recipientId: 2, senderId: 2, content: 'hi' })
    const invalid = await notifyComment({ recipientId: 0, senderId: 2, content: 'hi' })
    const empty = await notifyComment({ recipientId: 1, senderId: 2, content: '   ' })

    assert.equal(self.reason, 'self')
    assert.equal(invalid.reason, 'no_recipient')
    assert.equal(empty.reason, 'empty_content')
    assert.equal(inserts.length, 0)
})

test('通知内容按列宽截断到 500 字', async () => {
    await notifyComment({
        recipientId: 1,
        senderId: 2,
        content: 'x'.repeat(600),
    })

    assert.equal(inserts[0].payload.content.length, 500)
})
