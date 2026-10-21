const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const calls = []
let articleRows = [{ id: 10, state: 'published' }]
let parentRows = [{ id: 20, article_id: 10 }]
const modelPath = path.resolve(__dirname, '../model/dbModel/comment/index.js')
const originalLoad = Module._load

async function query(sql, values = []) {
    calls.push({ sql, values })
    if (sql.startsWith('SELECT id, state FROM article')) return articleRows
    if (sql.startsWith('SELECT id, article_id FROM comment')) return parentRows
    if (sql.startsWith('INSERT INTO comment')) return { insertId: 99 }
    return []
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === modelPath && request === '../../db/dbnew') {
        return { query }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const commentModel = require(modelPath)
Module._load = originalLoad

test.beforeEach(() => {
    calls.length = 0
    articleRows = [{ id: 10, state: 'published' }]
    parentRows = [{ id: 20, article_id: 10 }]
})

test('comment model refuses comments on non-published articles', async () => {
    articleRows = [{ id: 10, state: 'draft' }]
    await assert.rejects(
        commentModel.createComment({ userId: 1, articleId: 10, content: 'hello', parentId: 0 }),
        /仅已发布文章允许评论/
    )
    assert.equal(calls.some(call => call.sql.startsWith('INSERT INTO comment')), false)
})

test('comment model refuses parent comments from another article', async () => {
    parentRows = [{ id: 20, article_id: 11 }]
    await assert.rejects(
        commentModel.createComment({ userId: 1, articleId: 10, content: 'reply', parentId: 20 }),
        /回复评论必须存在且属于同一篇文章/
    )
    assert.equal(calls.some(call => call.sql.startsWith('INSERT INTO comment')), false)
})

test('comment model inserts only after validation passes', async () => {
    const result = await commentModel.createComment({
        userId: 1,
        articleId: 10,
        content: 'hello',
        parentId: 20
    })
    assert.deepEqual(result, { commentId: 99 })
    assert.equal(calls.at(-1).sql.startsWith('INSERT INTO comment'), true)
    assert.deepEqual(calls.at(-1).values, [1, 10, 20, 'hello'])
})
