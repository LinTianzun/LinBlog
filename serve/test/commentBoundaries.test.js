const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const controllerPath = path.resolve(__dirname, '../controller/commentController.js')
const originalLoad = Module._load
let parentRow = null
let createCalls = 0

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === controllerPath && request === '../model/dbModel/comment/index') {
        return {
            createComment: async () => { createCalls++; return { commentId: 99 } },
            deleteComment: async () => 1,
            getCommentsByPage: async () => ({ total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] }),
            getPublicCommentsByArticle: async () => ({ total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] }),
            findMyCommentsByPage: async () => ({ total: 0, page: 1, pageSize: 10, totalPage: 0, list: [] })
        }
    }
    if (parent && parent.filename === controllerPath && request === '../model/dbModel/article/index') {
        return { findAtricleStateById: async () => [{ id: 10, state: 'published' }] }
    }
    if (parent && parent.filename === controllerPath && request === '../model/db/dbnew') {
        // 模拟 SQL 的 WHERE article_id 过滤：参数里的文章ID必须与父评论一致才返回行
        return {
            query: async (_sql, params) => {
                if (parentRow && Array.isArray(params) && Number(params[1]) === Number(parentRow.article_id)) {
                    return [parentRow]
                }
                return []
            }
        }
    }
    if (parent && parent.filename === controllerPath && request === '../utils/logHelper') {
        return { writeSystemLog: () => {} }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const { createComment } = require(controllerPath)
Module._load = originalLoad

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}
async function submit(body) {
    const res = response()
    await createComment({ body, user: { userId: 7, userType: 'normal' } }, res)
    return res
}

test.beforeEach(() => { parentRow = null; createCalls = 0 })

test('rejects a reply to a second-level comment', async () => {
    parentRow = { id: 20, article_id: 10, parent_id: 19 }
    const res = await submit({ articleId: 10, content: 'reply', parentId: 20 })
    assert.equal(res.statusCode, 400)
    assert.equal(createCalls, 0)
})

test('rejects a reply to a comment on another article', async () => {
    parentRow = { id: 20, article_id: 11, parent_id: 0 }
    const res = await submit({ articleId: 10, content: 'reply', parentId: 20 })
    assert.equal(res.statusCode, 404)
    assert.equal(createCalls, 0)
})

test('accepts a reply to a first-level comment on the same article', async () => {
    parentRow = { id: 20, article_id: 10, parent_id: 0 }
    const res = await submit({ articleId: 10, content: 'reply', parentId: 20 })
    assert.equal(res.statusCode, 201)
    assert.equal(createCalls, 1)
})

test('rejects negative or non-integer parent IDs', async () => {
    const res = await submit({ articleId: 10, content: 'reply', parentId: -1 })
    assert.equal(res.statusCode, 400)
    assert.equal(createCalls, 0)
})
