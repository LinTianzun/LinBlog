const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/messageController.js')
const originalLoad = Module._load
const insertCalls = []
let ownerId = 1
let conversationsResult = { owner: null, conversations: [] }
let conversationResult = { target: null, list: [], total: 0, page: 1, pageSize: 50, totalPage: 0 }
let conversationCalls = []

const messageModel = {
    async insertMessage(payload, senderId) {
        insertCalls.push({ payload, senderId })
        return { messageId: 99 }
    },
    async getOwnerId() {
        return ownerId
    },
    async getConversations(currentUserId, resolvedOwnerId, isOwner) {
        return conversationsResult
    },
    async getConversationMessages(currentUserId, targetUserId, page, pageSize, offset) {
        conversationCalls.push({ currentUserId, targetUserId, page, pageSize, offset })
        return conversationResult
    },
    async findActiveUser(userId) {
        return userId === 404 ? null : { id: userId, name: '用户' + userId, avatar: null }
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
    ownerId = 1
    conversationsResult = { owner: null, conversations: [] }
    conversationResult = { target: null, list: [], total: 0, page: 1, pageSize: 50, totalPage: 0 }
    conversationCalls = []
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

test('普通账号只能给博主发送私信，且不能发给自己', async () => {
    const toOtherUser = makeResponse()
    await messageController.sendMessage({
        body: { receiverId: 2, type: 'private', content: 'hi' },
        user: { userId: 3, userType: 'normal' }
    }, toOtherUser)
    assert.equal(toOtherUser.statusCode, 403)
    assert.match(toOtherUser.body.message, /只能给博主/)

    const toSelf = makeResponse()
    await messageController.sendMessage({
        body: { receiverId: 1, type: 'private', content: 'hi' },
        user: { userId: 1, userType: 'admin' }
    }, toSelf)
    assert.equal(toSelf.statusCode, 400)

    assert.equal(insertCalls.length, 0)
})

test('博主可以回复任意用户，普通账号可以发给博主', async () => {
    const fromOwner = makeResponse()
    await messageController.sendMessage({
        body: { receiverId: 5, type: 'private', content: 'reply' },
        user: { userId: 1, userType: 'admin' }
    }, fromOwner)
    assert.equal(fromOwner.statusCode, 201)

    const toOwner = makeResponse()
    await messageController.sendMessage({
        body: { receiverId: 1, type: 'private', content: 'hello owner' },
        user: { userId: 5, userType: 'normal' }
    }, toOwner)
    assert.equal(toOwner.statusCode, 201)

    assert.equal(insertCalls.length, 2)
})

test('普通账号只能查看与博主的会话，博主可查看任意会话', async () => {
    const denied = makeResponse()
    await messageController.getConversation({
        params: { userId: '2' },
        query: {},
        user: { userId: 3, userType: 'normal', permissions: ['message.private'] }
    }, denied)
    assert.equal(denied.statusCode, 403)
    assert.equal(conversationCalls.length, 0)

    const allowed = makeResponse()
    await messageController.getConversation({
        params: { userId: '1' },
        query: { page: '2', pageSize: '20' },
        user: { userId: 3, userType: 'normal', permissions: ['message.private'] }
    }, allowed)
    assert.equal(allowed.statusCode, 200)
    assert.deepEqual(conversationCalls[0], {
        currentUserId: 3, targetUserId: 1, page: 2, pageSize: 20, offset: 20
    })

    const owner = makeResponse()
    await messageController.getConversation({
        params: { userId: '2' },
        query: {},
        user: { userId: 1, userType: 'admin', permissions: ['message.private'] }
    }, owner)
    assert.equal(owner.statusCode, 200)
    assert.equal(conversationCalls[1].targetUserId, 2)
})

test('会话列表按当前账号是否博主区分范围', async () => {
    conversationsResult = {
        owner: { id: 1, name: '博主', avatar: null },
        conversations: [{ userId: 2, name: '读者', unreadCount: 1 }]
    }
    const res = makeResponse()
    await messageController.getConversations({
        user: { userId: 1, userType: 'admin', permissions: ['message.private'] }
    }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.conversations.length, 1)
})
