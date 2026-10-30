const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'

const calls = []
let mutationAccessRows = []
let updateAffectedRows = 1
let stateSummaryRows = []
const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')
const originalLoad = Module._load

async function query(sql, values = []) {
    calls.push({ sql, values })
    if (sql.includes('GROUP BY a.state')) return stateSummaryRows
    if (sql.includes('COUNT(*)')) return [{ total: 1 }]
    if (sql.includes('INSERT INTO article')) return { insertId: 123 }
    if (sql.includes('SELECT id, user_id, state, classify FROM article')) return mutationAccessRows
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
    stateSummaryRows = []
})

test('article list query exposes workflow state for cards', async () => {
    await articleModel.findArticlesByPage({
        page: 1,
        pageSize: 10,
        offset: 0,
        classify: 'article',
        userId: 1,
        userType: 'admin',
    })

    const listQuery = calls.find(call => call.sql.includes('FROM article a'))
    assert.ok(listQuery)
    assert.match(listQuery.sql, /hasUnpublishedChanges/)
    assert.match(listQuery.sql, /a\.scheduled_at AS scheduledAt/)
})

test('article state summary aggregates counts per state and uncategorized', async () => {
    stateSummaryRows = [
        { state: 'published', total: 3 },
        { state: 'draft', total: 2 },
        { state: 'rejected', total: 1 }
    ]

    const summary = await articleModel.countArticlesByState({
        classify: 'article',
        userId: 1,
        userType: 'admin'
    })

    assert.deepEqual(summary, {
        all: 6,
        published: 3,
        draft: 2,
        rejected: 1,
        uncategorized: 1
    })
    assert.match(calls[0].sql, /a\.classify = \?[\s\S]*GROUP BY a\.state/)
    assert.deepEqual(calls[0].values, ['deleted', 'article'])
    assert.match(calls[1].sql, /a\.subset_id IS NULL/)
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

test('article list splits comment totals into root comments and replies', async () => {
    await articleModel.findArticlesByPage({
        page: 1,
        pageSize: 10,
        offset: 0,
        userId: 1,
        userType: 'admin'
    })

    // 一级评论与回复分别按 parent_id = 0 / > 0 统计，卡片才能分开显示两个口径
    assert.match(calls[0].sql, /AS root_comments/)
    assert.match(calls[0].sql, /AS reply_comments/)
    assert.match(calls[0].sql, /c2\.parent_id = 0/)
    assert.match(calls[0].sql, /c2\.parent_id > 0/)
    // 子查询只看未删除评论，且不能引入额外的占位参数
    assert.match(calls[0].sql, /c2\.status = 1/)
    assert.deepEqual(calls[0].values, ['deleted', 10, 0])
})

test('article list supports keyword and uncategorized filters', async () => {
    await articleModel.findArticlesByPage({
        page: 1,
        pageSize: 10,
        offset: 0,
        uncategorized: true,
        keyword: '联调',
        userId: 1,
        userType: 'admin'
    })

    assert.match(
        calls[0].sql,
        /a\.subset_id IS NULL AND \(\s*a\.title LIKE \?\s*OR a\.introduce LIKE \?\s*OR a\.label LIKE \?\s*OR a\.content LIKE \?\s*\)/
    )
    assert.deepEqual(calls[0].values, [
        'deleted', '%联调%', '%联调%', '%联调%', '%联调%', 10, 0
    ])
    assert.deepEqual(calls[1].values, [
        'deleted', '%联调%', '%联调%', '%联调%', '%联调%'
    ])
})

test('article controller normalizes keyword and passes list filters to the model', async () => {
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

    await articleController.getArticles({
        query: {
            page: '1',
            pageSize: '10',
            keyword: '  联调  ',
            uncategorized: 'true'
        },
        user: { userId: 1, userType: 'admin' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.match(
        calls[0].sql,
        /a\.subset_id IS NULL AND \(\s*a\.title LIKE \?\s*OR a\.introduce LIKE \?\s*OR a\.label LIKE \?\s*OR a\.content LIKE \?\s*\)/
    )
    assert.deepEqual(calls[0].values, [
        'deleted', '%联调%', '%联调%', '%联调%', '%联调%', 10, 0
    ])
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
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft', classify: 'article' }]
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
        // 文章作者本人：拥有「管理自己的文章」权限即可清空可空字段
        user: { userId: 42, userType: 'normal', permissions: ['article.manageOwn'] }
    }, res)

    assert.equal(res.statusCode, 200)
    // 控制器先探测内容类型再判定权限，因此 UPDATE 是第三次查询
    assert.deepEqual(calls[2].values, [null, null, null, null, '123', 'deleted', 42])
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
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft', classify: 'article' }]

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
        user: { userId: 42, userType: 'normal', permissions: ['article.manageOwn'] }
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
    // 只做权限探测，不拼接任何 UPDATE：被拒绝的请求不写库
    assert.equal(
        calls.some(call => call.sql.includes('UPDATE article')),
        false
    )
})

test('article controller rejects gallery mutations when the account only holds article permissions', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft', classify: 'image' }]

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

    const denied = makeResponse()
    await articleController.updateArticle({
        params: { id: '123' },
        body: { title: 'Renamed gallery' },
        user: { userId: 42, userType: 'normal', permissions: ['article.manageOwn'] }
    }, denied)

    assert.equal(denied.statusCode, 403)
    assert.equal(
        calls.some(call => call.sql.includes('UPDATE article')),
        false
    )

    const allowed = makeResponse()
    await articleController.updateArticle({
        params: { id: '123' },
        body: { title: 'Renamed gallery' },
        user: { userId: 42, userType: 'normal', permissions: ['gallery.manageOwn'] }
    }, allowed)

    assert.equal(allowed.statusCode, 200)
    assert.ok(calls.some(call => call.sql.includes('UPDATE article')))
})

test('article mutation access distinguishes ownership and editable state', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'rejected', classify: 'article' }]

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
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'published', classify: 'article' }]
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
        user: { userId: 1, userType: 'admin', permissions: ['article.manageAll', 'article.publish'] }
    }, updateResponse)

    assert.equal(updateResponse.statusCode, 200)

    const statusResponse = makeResponse()
    await articleController.updateArticleStatus({
        params: { id: '123' },
        body: { state: 'published' },
        user: { userId: 1, userType: 'admin', permissions: ['article.manageAll', 'article.publish'] }
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
        user: { userId: 1, userType: 'admin', permissions: ['article.manageAll'] }
    }, res)

    assert.equal(res.statusCode, 404)
})

// 权限矩阵：发布/驳回由独立权限控制，没有该权限的账号不能直接发布
test('article controller blocks publish when the account lacks publish permission', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft', classify: 'article' }]

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

    const res = makeResponse()
    await articleController.updateArticleStatus({
        params: { id: '123' },
        body: { state: 'published' },
        user: { userId: 42, userType: 'normal', permissions: ['article.manageOwn'] }
    }, res)

    assert.equal(res.statusCode, 403)
    assert.match(res.body.message, /发布或驳回/)
})

// 图库与文章分属两个权限前缀，避免只凭文章权限操作图库
test('article controller scopes gallery mutations to gallery permissions', async () => {
    mutationAccessRows = [{ id: 123, user_id: 42, state: 'draft', classify: 'image' }]

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

    const denied = makeResponse()
    await articleController.updateArticle({
        params: { id: '123' },
        body: { title: 'Renamed gallery' },
        user: { userId: 42, userType: 'normal', permissions: ['article.manageOwn'] }
    }, denied)

    assert.equal(denied.statusCode, 403)

    const allowed = makeResponse()
    await articleController.updateArticle({
        params: { id: '123' },
        body: { title: 'Renamed gallery' },
        user: { userId: 42, userType: 'normal', permissions: ['gallery.manageOwn'] }
    }, allowed)

    assert.equal(allowed.statusCode, 200)
})
