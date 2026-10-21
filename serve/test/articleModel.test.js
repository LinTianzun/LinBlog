const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const calls = []
const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')
const originalLoad = Module._load

async function query(sql, values = []) {
    calls.push({ sql, values })
    if (sql.includes('COUNT(*)')) return [{ total: 1 }]
    if (sql.includes('INSERT INTO article')) return { insertId: 123 }
    if (sql.includes('UPDATE article')) return { affectedRows: 1 }
    return []
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === articleModelPath && request === '../../db/dbnew') {
        return { query }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const articleModel = require(articleModelPath)
Module._load = originalLoad
const articleController = require('../controller/articleController')

test.beforeEach(() => {
    calls.length = 0
})

test('new articles persist their authenticated owner', async () => {
    await articleModel.insertArticle({
        userId: 42,
        title: 'Title',
        content: '<p>Content</p>',
        classify: 'article'
    })

    assert.match(calls[0].sql, /user_id,\s*title/)
    assert.deepEqual(calls[0].values, [
        42, 'Title', null, 'article', '', '', '<p>Content</p>', ''
    ])
})

test('article list filters compose valid SQL and preserve parameter order', async () => {
    await articleModel.findArticlesByPage({
        page: 1,
        pageSize: 10,
        offset: 0,
        state: 'published',
        classify: 'image',
        subsetId: 3,
        userId: 42,
        userType: 'normal'
    })

    assert.match(
        calls[0].sql,
        /a\.state != \? AND a\.user_id = \? AND a\.state = \? AND a\.classify = \? AND a\.subset_id = \?/
    )
    assert.deepEqual(calls[0].values, ['deleted', 42, 'published', 'image', 3, 10, 0])
    assert.deepEqual(calls[1].values, ['deleted', 42, 'published', 'image', 3])
})

test('visitors can only list and read published articles', async () => {
    await articleModel.findArticlesByPage({
        page: 1,
        pageSize: 10,
        offset: 0,
        userId: 42,
        userType: 'visitor'
    })
    await articleModel.findAtricleById(123, 42, 'visitor')

    assert.match(calls[0].sql, /a\.state != \? AND a\.state = \?/)
    assert.deepEqual(calls[0].values, ['deleted', 'published', 10, 0])
    assert.match(calls[2].sql, /a\.state != \? AND a\.state = \?/)
    assert.deepEqual(calls[2].values, [123, 'deleted', 'published'])
})

test('normal users can edit and delete only their own articles but cannot change review state', async () => {
    await articleModel.updateArticle(123, { title: 'Updated' }, 42, 'normal')
    await articleModel.deleteArticle(123, 42, 'normal')
    const stateUpdate = await articleModel.updateArticleStatus(123, 'published', 42, 'normal')
    const genericStateUpdate = await articleModel.updateArticle(123, { state: 'published' }, 42, 'normal')

    assert.match(calls[0].sql, /WHERE id = \\? AND state != \\? AND user_id = \\?/)
    assert.deepEqual(calls[0].values, ['Updated', 123, 'deleted', 42])
    assert.match(calls[1].sql, /WHERE id = \\? AND state != \\? AND user_id = \\?/)
    assert.deepEqual(calls[1].values, [123, 'deleted', 42])
    assert.equal(stateUpdate, 0)
    assert.equal(genericStateUpdate, 0)
    assert.equal(calls.length, 2)
})

test('visitors cannot create or mutate articles', async () => {
    const response = {
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

    await articleController.createArticle({
        body: { title: 'Title', content: 'Content', classify: 'article' },
        user: { userId: 42, userType: 'visitor' }
    }, response)

    assert.equal(response.statusCode, 403)
    assert.equal(calls.length, 0)
    assert.equal(await articleModel.updateArticle(123, { title: 'Updated' }, 42, 'visitor'), 0)
    assert.equal(await articleModel.deleteArticle(123, 42, 'visitor'), 0)
    assert.equal(await articleModel.updateArticleStatus(123, 'published', 42, 'visitor'), 0)
    assert.equal(calls.length, 0)
})


test('article deletion SQL excludes articles already marked deleted and updates timestamp', async () => {
    await articleModel.deleteArticle(123, 42, 'normal')
    assert.match(calls[0].sql, /SET state = 'deleted', updated_at = NOW\\(\\)/)
    assert.match(calls[0].sql, /WHERE id = \\? AND state != \\? AND user_id = \\?/)
    assert.deepEqual(calls[0].values, [123, 'deleted', 42])
})
