const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const commentControllerPath = path.resolve(__dirname, '../controller/commentController.js')
const praiseControllerPath = path.resolve(__dirname, '../controller/praiseController.js')
const originalLoad = Module._load

let articleState = 'published'
let parentRow = null
let createCalls = []
let toggleResult = null
let likeState = null
let logCalls = []

const commentModel = {
    async getCommentsByPage() { return { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] } },
    async getPublicCommentsByArticle() { return { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] } },
    async createComment(data) {
        createCalls.push(data)
        return { commentId: 88 }
    },
    async deleteComment() { return 1 },
    async findMyCommentsByPage() { return { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] } }
}

const articleModel = {
    async findAtricleStateById() {
        return articleState ? [{ id: 5, state: articleState }] : []
    }
}

const praiseModel = {
    async findLikeState() { return likeState },
    async toggleLike() { return toggleResult }
}

async function query(_sql, values) {
    // 控制器查询父评论时参数顺序是 [parentId, articleId]，用第二条参数比对文章归属
    if (parentRow && Array.isArray(values) && Number(values[1]) === 5) {
        return [parentRow]
    }
    return []
}

Module._load = function (request, parent, isMain) {
    const filename = parent && parent.filename
    if (filename === commentControllerPath) {
        if (request === '../model/dbModel/comment/index') return commentModel
        if (request === '../model/dbModel/article/index') return articleModel
        if (request === '../model/db/dbnew') return { query }
    }
    if (filename === praiseControllerPath) {
        if (request === '../model/dbModel/praise/index') return praiseModel
    }
    if (filename === commentControllerPath || filename === praiseControllerPath) {
        if (request === '../utils/logHelper') {
            return { writeSystemLog: (entry) => logCalls.push(entry) }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const commentController = require(commentControllerPath)
const praiseController = require(praiseControllerPath)
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
    articleState = 'published'
    parentRow = null
    createCalls = []
    toggleResult = null
    likeState = null
    logCalls = []
})

test('anonymous visitors are rejected when posting public comments', async () => {
    const res = makeResponse()
    await commentController.createPublicComment({
        body: { articleId: 5, content: 'hello' },
        user: { userId: null, userType: 'visitor' }
    }, res)

    assert.equal(res.statusCode, 401)
    assert.match(res.body.message, /登录/)
    assert.equal(createCalls.length, 0)
})

test('public comments cannot target draft or rejected articles', async () => {
    for (const state of ['draft', 'rejected']) {
        articleState = state
        const res = makeResponse()
        await commentController.createPublicComment({
            body: { articleId: 5, content: 'hello' },
            user: { userId: 42, userType: 'normal' }
        }, res)
        assert.equal(res.statusCode, 403)
    }
    assert.equal(createCalls.length, 0)
})

test('public comments on published articles return the created comment', async () => {
    const res = makeResponse()
    await commentController.createPublicComment({
        body: { articleId: '5', content: '  门户评论  ' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(createCalls, [{
        userId: 42,
        articleId: 5,
        content: '门户评论',
        parentId: 0,
        replyToCommentId: null,
        replyToUserId: null
    }])
    assert.equal(res.body.data.commentId, 88)
    assert.equal(res.body.data.articleId, 5)
})

test('replying to a second-level comment stays under its root comment', async () => {
    parentRow = { id: 7, user_id: 11, parent_id: 3 }
    const res = makeResponse()
    await commentController.createPublicComment({
        body: { articleId: 5, parentId: 7, content: 'reply' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(createCalls, [{
        userId: 42,
        articleId: 5,
        content: 'reply',
        parentId: 3,
        replyToCommentId: 7,
        replyToUserId: 11
    }])
})

test('anonymous visitors are rejected when toggling likes', async () => {
    const res = makeResponse()
    await praiseController.toggleLike({
        params: { id: '5' },
        user: { userId: null, userType: 'visitor' }
    }, res)

    assert.equal(res.statusCode, 401)
    assert.match(res.body.message, /登录/)
})

test('like state is readable anonymously and hides the liked flag', async () => {
    likeState = { liked: false, likes: 8, state: 'published' }
    const res = makeResponse()
    await praiseController.getLikeState({
        params: { id: '5' },
        user: { userId: null, userType: 'visitor' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { liked: false, likes: 8 })
})

test('like state is hidden for unpublished articles', async () => {
    likeState = { liked: false, likes: 0, state: 'draft' }
    const res = makeResponse()
    await praiseController.getLikeState({
        params: { id: '5' },
        user: { userId: 1, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 404)
})

test('toggling a like returns the new state and writes a system log', async () => {
    toggleResult = { liked: true, likes: 9 }
    const res = makeResponse()
    await praiseController.toggleLike({
        params: { id: '5' },
        user: { userId: 42, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { liked: true, likes: 9 })
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].action, 'like')
})

test('unliking reports the previous action in the system log', async () => {
    toggleResult = { liked: false, likes: 8 }
    const res = makeResponse()
    await praiseController.toggleLike({
        params: { id: '5' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(logCalls[0].action, 'unlike')
})

test('liking a missing or unpublished article returns 404', async () => {
    toggleResult = null
    const res = makeResponse()
    await praiseController.toggleLike({
        params: { id: '5' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 404)
})

test('invalid article ids are rejected before touching the database', async () => {
    for (const id of ['0', '-3', 'abc', '1.5']) {
        const res = makeResponse()
        await praiseController.getLikeState({
            params: { id },
            user: { userId: 1, userType: 'normal' }
        }, res)
        assert.equal(res.statusCode, 400)
    }
})
