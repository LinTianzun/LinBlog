const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const calls = []
let mutationAccessRows = []
let updateAffectedRows = 1
const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')
const originalLoad = Module._load

async function query(sql, values = []) {
    calls.push({ sql, values })
    if (sql.includes('COUNT(*)')) return [{ total: 1 }]
    if (sql.includes('INSERT INTO article')) return { insertId: 123 }
    if (sql.includes('SELECT id, user_id, state FROM article')) return mutationAccessRows
    if (sql.includes('UPDATE article')) return { affectedRows: updateAffectedRows }
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
    mutationAccessRows = []
    updateAffectedRows = 1
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

test('normal users can edit only their own draft or rejected articles', async () => {
    await articleModel.updateArticle(123, { title: 'Updated' }, 42, 'normal')
    await articleModel.deleteArticle(123, 42, 'normal')

    assert.match(calls[0].sql, /WHERE id = \? AND state != \? AND user_id = \? AND state IN \('draft', 'rejected'\)/)
    assert.deepEqual(calls[0].values, ['Updated', 123, 'deleted', 42])
    assert.match(calls[1].sql, /WHERE id = \? AND state != \? AND user_id = \?/)
    assert.deepEqual(calls[1].values, [123, 'deleted', 42])
})

test('nullable article fields can be cleared', async () => {
    await articleModel.updateArticle(123, {
        subsetId: null,
        label: null,
        introduce: null,
        cover: null
    }, 42, 'normal')

    assert.match(
        calls[0].sql,
        /SET subset_id = \?, label = \?, introduce = \?, cover = \?/
    )
    assert.deepEqual(calls[0].values, [null, null, null, null, 123, 'deleted', 42])
})

test('article controller accepts clearing nullable fields', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft' }]
    const res = {
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

    await articleController.updateArticle({
        params: { id: '123' },
        body: {
            subsetId: null,
            label: null,
            introduce: null,
            cover: null
        },
        user: { userId: 42, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(calls[1].values, [null, null, null, null, '123', 'deleted', 42])
})

test('normal users cannot publish or reject articles through model methods', async () => {
    assert.equal(await articleModel.updateArticle(123, { state: 'published' }, 42, 'normal'), 0)
    assert.equal(await articleModel.updateArticle(123, { state: 'rejected' }, 42, 'normal'), 0)
    assert.equal(await articleModel.updateArticleStatus(123, 'published', 42, 'normal'), 0)
    assert.equal(await articleModel.updateArticleStatus(123, 'rejected', 42, 'normal'), 0)
    assert.equal(calls.length, 0)
})

test('normal users can only return their rejected articles to draft', async () => {
    assert.equal(await articleModel.updateArticleStatus(123, 'draft', 42, 'normal'), 1)
    assert.match(calls[0].sql, /WHERE article\.id = \? AND article\.state != \? AND article\.user_id = \? AND article\.state = 'rejected'/)
    assert.deepEqual(calls[0].values, ['draft', 123, 'deleted', 42])
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


test('article controller rejects normal-user publish and reject requests', async () => {
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

    const req = {
        params: { id: '123' },
        body: { state: 'published' },
        user: { userId: 42, userType: 'normal' }
    }

    const updateResponse = makeResponse()
    await articleController.updateArticle(req, updateResponse)
    assert.equal(updateResponse.statusCode, 403)

    const statusResponse = makeResponse()
    await articleController.updateArticleStatus(req, statusResponse)
    assert.equal(statusResponse.statusCode, 403)

    const rejectResponse = makeResponse()
    await articleController.updateArticleStatus({
        ...req,
        body: { state: 'rejected' }
    }, rejectResponse)
    assert.equal(rejectResponse.statusCode, 403)
    assert.equal(calls.length, 0)
})

test('article mutation access distinguishes ownership and editable state', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'rejected' }]

    assert.deepEqual(
        await articleModel.findArticleMutationAccess(123, 42, 'normal', 'update'),
        {
            exists: true,
            allowed: true,
            article: mutationAccessRows[0]
        }
    )

    mutationAccessRows = [{ id: 123, user_id: 42, state: 'published' }]
    assert.equal(
        (await articleModel.findArticleMutationAccess(123, 42, 'normal', 'update')).allowed,
        false
    )

    mutationAccessRows = [{ id: 123, user_id: 99, state: 'draft' }]
    assert.equal(
        (await articleModel.findArticleMutationAccess(123, 42, 'normal', 'update')).allowed,
        false
    )
})

test('unchanged article updates are reported as success instead of 403', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'published' }]
    updateAffectedRows = 0

    const makeResponse = () => ({
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
    })

    const updateResponse = makeResponse()
    await articleController.updateArticle({
        params: { id: '123' },
        body: { title: 'Unchanged title' },
        user: { userId: 1, userType: 'admin' }
    }, updateResponse)

    assert.equal(updateResponse.statusCode, 200)

    const statusResponse = makeResponse()
    await articleController.updateArticleStatus({
        params: { id: '123' },
        body: { state: 'published' },
        user: { userId: 1, userType: 'admin' }
    }, statusResponse)

    assert.equal(statusResponse.statusCode, 200)
})

test('article controller returns 404 when the article does not exist', async () => {
    mutationAccessRows = []
    const res = {
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

    await articleController.updateArticle({
        params: { id: '404' },
        body: { title: 'Missing' },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.statusCode, 404)
})
