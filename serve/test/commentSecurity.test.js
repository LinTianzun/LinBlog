const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/commentController.js')
const originalLoad = Module._load
let articleState = 'published'
let parentRow = { id: 7 }
const queryCalls = []
const createCalls = []

const commentModel = {
    async getCommentsByPage() { return { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] } },
    async createComment(data) {
        createCalls.push(data)
        return { commentId: 99 }
    },
    async deleteComment() { return 1 },
    async findMyCommentsByPage() { return { total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] } }
}
const articleModel = {
    async findAtricleStateById() {
        return articleState ? [{ id: 5, state: articleState }] : []
    }
}
async function query(sql, values) {
    queryCalls.push({ sql, values })
    return parentRow ? [parentRow] : []
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath) {
        if (request === '../model/dbModel/comment/index') return commentModel
        if (request === '../model/dbModel/article/index') return articleModel
        if (request === '../../model/db/dbnew') return { query }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const commentController = require(controllerPath)
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
    parentRow = { id: 7 }
    queryCalls.length = 0
    createCalls.length = 0
})

test('comments cannot be created on draft or rejected articles', async () => {
    for (const state of ['draft', 'rejected']) {
        articleState = state
        const res = makeResponse()
        await commentController.createComment({
            body: { articleId: 5, content: 'hello' },
            user: { userId: 42, userType: 'normal' }
        }, res)
        assert.equal(res.statusCode, 403)
    }
    assert.equal(createCalls.length, 0)
})

test('reply parent must belong to the same article', async () => {
    parentRow = null
    const res = makeResponse()
    await commentController.createComment({
        body: { articleId: 5, parentId: 7, content: 'reply' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 404)
    assert.match(queryCalls[0].sql, /id = \? AND article_id = \? AND status = 1/)
    assert.deepEqual(queryCalls[0].values, [7, 5])
    assert.equal(createCalls.length, 0)
})

test('valid replies on published articles are created with normalized IDs', async () => {
    const res = makeResponse()
    await commentController.createComment({
        body: { articleId: '5', parentId: '7', content: '  reply  ' },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(createCalls, [{
        userId: 42,
        articleId: 5,
        content: 'reply',
        parentId: 7
    }])
})

test('invalid article and parent IDs are rejected', async () => {
    for (const body of [
        { articleId: '0', content: 'hello' },
        { articleId: 5, parentId: '-1', content: 'hello' },
        { articleId: 5, parentId: '1.5', content: 'hello' },
        { articleId: 5, content: { text: 'hello' } }
    ]) {
        const res = makeResponse()
        await commentController.createComment({
            body,
            user: { userId: 42, userType: 'normal' }
        }, res)
        assert.equal(res.statusCode, 400)
    }
    assert.equal(createCalls.length, 0)
})
