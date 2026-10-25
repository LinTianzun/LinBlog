const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/messageController.js')
const originalLoad = Module._load
const insertCalls = []

const messageModel = {
    async insertMessage(payload, senderId) {
        insertCalls.push({ payload, senderId })
        return { messageId: 99 }
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/message/index') return messageModel
        if (request === '../utils/logHelper') return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const messageController = require(controllerPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(body) {
            this.body = body
            return this
        }
    }
}

test.beforeEach(() => {
    insertCalls.length = 0
})

test('non-admin users cannot send system messages or notices', async () => {
    for (const userType of ['visitor', 'normal', 'editor']) {
        for (const type of ['system', 'notice']) {
            const res = makeResponse()
            await messageController.sendMessage({
                body: { receiverId: 2, type, content: 'forged notice' },
                user: { userId: 1, userType }
            }, res)

            assert.equal(res.statusCode, 403)
        }
    }

    assert.equal(insertCalls.length, 0)
})

test('all authenticated roles can send private messages', async () => {
    for (const userType of ['visitor', 'normal', 'editor', 'admin']) {
        const res = makeResponse()
        await messageController.sendMessage({
            body: { receiverId: '2', type: 'private', content: ' hello ' },
            user: { userId: 1, userType }
        }, res)

        assert.equal(res.statusCode, 201)
    }

    assert.equal(insertCalls.length, 4)
    assert.deepEqual(insertCalls[0], {
        payload: { receiverId: 2, type: 'private', content: 'hello' },
        senderId: 1
    })
})

test('admins can send system messages and notices', async () => {
    for (const type of ['system', 'notice']) {
        const res = makeResponse()
        await messageController.sendMessage({
            body: { receiverId: 2, type, content: 'system message' },
            user: { userId: 1, userType: 'admin' }
        }, res)

        assert.equal(res.statusCode, 201)
    }

    assert.equal(insertCalls.length, 2)
})
