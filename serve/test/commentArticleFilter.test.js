const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/comment/index.js')
const controllerPath = path.resolve(__dirname, '../controller/commentController.js')
const originalLoad = Module._load

let calls = []

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath && request === '../../db/dbnew') {
        return {
            async query(sql, values = []) {
                calls.push({ sql, values })
                if (/COUNT\(\*\)/.test(sql)) return [{ total: 0 }]
                return []
            }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}
delete require.cache[modelPath]
const commentModel = require(modelPath)
Module._load = originalLoad

test.beforeEach(() => {
    calls = []
})

test('评论列表按文章过滤时列表与总数共用同一条件', async () => {
    await commentModel.getCommentsByPage(1, 10, 0, 42)

    assert.equal(calls.length, 2)
    assert.match(calls[0].sql, /c\.article_id = \?/)
    assert.deepEqual(calls[0].values, [42, 10, 0])

    assert.match(calls[1].sql, /c\.article_id = \?/)
    assert.deepEqual(calls[1].values, [42])
})

test('不传文章ID时仍是全站评论，不拼接文章条件', async () => {
    await commentModel.getCommentsByPage(1, 10, 0)

    assert.equal(calls.length, 2)
    assert.ok(!calls[0].sql.includes('c.article_id = ?'))
    assert.deepEqual(calls[0].values, [10, 0])
    assert.deepEqual(calls[1].values, [])
})

test('控制器校验 articleId：非法值返回 400 且不查询模型', async () => {
    const controllers = loadController()
    for (const articleId of ['0', '-5', 'abc', '1.5']) {
        const res = makeResponse()
        await controllers.controller.getComments({ query: { articleId } }, res)
        assert.equal(res.statusCode, 400, `articleId=${articleId} 应被拒绝`)
    }
    assert.equal(controllers.modelCalls.length, 0)
})

test('控制器把合法的 articleId 透传给模型', async () => {
    const controllers = loadController()
    const res = makeResponse()
    await controllers.controller.getComments({ query: { articleId: '42', page: '2', pageSize: '5' } }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(controllers.modelCalls, [{
        page: 2,
        pageSize: 5,
        offset: 5,
        articleId: 42
    }])
})

function loadController() {
    const modelCalls = []
    Module._load = function (request, parent, isMain) {
        const filename = parent && parent.filename
        if (filename === controllerPath) {
            if (request === '../model/dbModel/comment/index') {
                return {
                    async getCommentsByPage(page, pageSize, offset, articleId) {
                        modelCalls.push({ page, pageSize, offset, articleId })
                        return { total: 0, page, pageSize, totalPage: 0, list: [] }
                    }
                }
            }
            if (request === '../model/dbModel/article/index') return {}
            if (request === '../model/db/dbnew') return { query: async () => [] }
            if (request === '../utils/logHelper') return { writeSystemLog: () => {} }
        }
        return originalLoad.call(this, request, parent, isMain)
    }

    delete require.cache[controllerPath]
    const controller = require(controllerPath)
    Module._load = originalLoad

    return { controller, modelCalls }
}

function makeResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this }
    }
}
