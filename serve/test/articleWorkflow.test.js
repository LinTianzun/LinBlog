const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

process.env.LINBLOG_JWT_SECRET = 'test-secret-at-least-32-characters-long'
process.env.LINBLOG_ALLOWED_ORIGINS = 'http://localhost:5173'

const workflowPath = path.resolve(__dirname, '../model/dbModel/articleWorkflow/index.js')
const controllerPath = path.resolve(__dirname, '../controller/articleWorkflowController.js')
const schedulerPath = path.resolve(__dirname, '../utils/articleScheduler.js')
const originalLoad = Module._load
const calls = []

let articleRows = []
let versionRows = []
let dueRows = []
let transactionHandler = null
let mutationAccess = null

async function query(sql, values = []) {
    calls.push({ sql, values })
    if (sql.includes('FROM article_version')) {
        if (sql.includes('COUNT(*)')) return [{ total: versionRows.length }]
        if (sql.includes('WHERE article_id = ? AND id = ?')) {
            return versionRows.filter(row => Number(row.id) === Number(values[1]))
        }
        if (sql.includes('ORDER BY revision DESC')) {
            return versionRows.slice().sort((a, b) => Number(b.revision) - Number(a.revision))
        }
        return versionRows
    }
    if (sql.includes('FROM article')) {
        if (sql.includes('scheduled_at <= NOW()')) return dueRows
        return articleRows
    }
    if (sql.includes('UPDATE article')) return { affectedRows: 1 }
    return []
}

async function withTransaction(callback) {
    const exec = async (sql, values = []) => {
        calls.push({ sql, values })
        if (sql.includes('SELECT') && sql.includes('FROM article')) {
            if (sql.includes('scheduled_at IS NOT NULL')) {
                return articleRows.filter(row => row.scheduledAt !== null)
            }
            return articleRows
        }
        if (sql.includes('INSERT INTO article_version')) {
            versionRows.push({
                id: versionRows.length + 1,
                articleId: values[0],
                revision: values[1],
                title: values[2],
                subsetId: values[3],
                classify: values[4],
                label: values[5],
                introduce: values[6],
                content: values[7],
                cover: values[8],
                state: values[9],
                source: values[10],
                createdBy: values[11],
                values,
            })
            return { insertId: versionRows.length }
        }
        if (sql.includes('UPDATE article')) {
            if (transactionHandler) return transactionHandler(sql, values)
            const isScheduledPublish = sql.includes('scheduled_at IS NOT NULL')
            if (isScheduledPublish && articleRows.every(row => row.scheduledAt === null)) {
                return { affectedRows: 0 }
            }
            return { affectedRows: 1 }
        }
        if (sql.includes('DELETE FROM article_version')) return { affectedRows: 0 }
        return []
    }
    return callback({
        query(sql, values, callback) {
            exec(sql, values).then(
                result => callback(null, result),
                error => callback(error)
            )
        },
    })
}

Module._load = function (request, parent, isMain) {
    if (parent?.filename === workflowPath) {
        if (request === '../../db/dbnew') return { query, withTransaction }
        if (request === '../label/index') {
            return { ensureLabels: async label => calls.push({ sql: 'ENSURE_LABELS', values: [label] }) }
        }
    }
    if (parent?.filename === controllerPath) {
        if (request === '../model/dbModel/articleWorkflow/index') {
            return workflowModel
        }
        if (request === '../model/dbModel/article/index') {
            return {
                findArticleMutationAccess: async () => mutationAccess || {
                    exists: true,
                    allowed: true,
                    article: articleRows[0],
                },
            }
        }
        if (request === '../utils/accessControl') {
            return {
                getArticleScope: (user) => {
                    const publish = user?.permissions?.includes('article.publish')
                    return {
                        viewAll: true,
                        viewOwn: true,
                        manageAll: true,
                        manageOwn: true,
                        publish: publish === true,
                    }
                },
            }
        }
        if (request === '../utils/logHelper') {
            return { writeSystemLog: payload => calls.push({ sql: 'LOG', values: [payload] }) }
        }
    }
    if (parent?.filename === schedulerPath) {
        if (request === '../model/dbModel/articleWorkflow/index') return workflowModel
        if (request === './logHelper') {
            return { writeSystemLog: payload => calls.push({ sql: 'LOG', values: [payload] }) }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const workflowModel = require(workflowPath)
const controller = require(controllerPath)
const scheduler = require(schedulerPath)
Module._load = originalLoad

function makeArticle(overrides = {}) {
    return {
        id: 10,
        userId: 1,
        title: '线上标题',
        subsetId: 2,
        classify: 'article',
        label: 'Vue',
        introduce: '线上简介',
        content: '<p>线上正文</p>',
        cover: '/api/uploads/online.jpg',
        state: 'published',
        publishedAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        scheduledAt: null,
        draftContent: null,
        draftPayload: null,
        draftRevision: 0,
        draftSavedAt: null,
        ...overrides,
    }
}

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
        },
    }
}

test.beforeEach(() => {
    calls.length = 0
    articleRows = [makeArticle()]
    versionRows = []
    dueRows = []
    transactionHandler = null
    mutationAccess = null
})

test('published articles keep their online fields while a working copy is saved', async () => {
    const result = await workflowModel.saveWorkingCopy(10, {
        title: '新标题',
        subsetId: 3,
        label: 'Vue,写作',
        introduce: '新简介',
        content: '<p>新正文</p>',
        cover: '/api/uploads/new.jpg',
        classify: 'article',
    }, { userId: 1, source: 'autosave', expectedRevision: 0 })

    assert.equal(result.revision, 1)
    assert.equal(result.hasUnpublishedChanges, true)
    const update = calls.find(call => call.sql.includes('draft_payload = ?'))
    assert.ok(update)
    // 自动保存不能更新线上 title/content/cover 等字段
    assert.equal(/SET title = \?/.test(update.sql), false)
    assert.equal(/SET title = \?.*content = \?/.test(update.sql), false)
    assert.deepEqual(JSON.parse(update.values[0]), {
        title: '新标题',
        subsetId: 3,
        classify: 'article',
        label: 'Vue,写作',
        introduce: '新简介',
        cover: '/api/uploads/new.jpg',
    })
})

test('working copy exposes merged metadata and rejects stale revisions', async () => {
    articleRows = [makeArticle({
        title: '线上标题',
        content: '<p>线上正文</p>',
        draftRevision: 4,
        draftContent: '<p>编辑中的正文</p>',
        draftPayload: JSON.stringify({
            title: '编辑中的标题',
            subsetId: 3,
            classify: 'article',
            label: 'Vue',
            introduce: '编辑中的简介',
            cover: '/api/uploads/draft.jpg',
        }),
    })]

    const state = await workflowModel.findWorkflowState(10)
    assert.equal(state.hasUnpublishedChanges, true)
    assert.equal(state.revision, 4)
    assert.equal(state.workingCopy.title, '编辑中的标题')
    assert.equal(state.workingCopy.content, '<p>编辑中的正文</p>')

    const conflict = await workflowModel.saveWorkingCopy(10, {
        title: '覆盖标题',
        content: '<p>覆盖正文</p>',
        classify: 'article',
    }, { userId: 1, expectedRevision: 3 })
    assert.equal(conflict.conflict, true)
    assert.equal(conflict.revision, 4)
    assert.equal(calls.some(call => call.sql.includes('draft_payload = ?')), false)
})

test('publishing applies the working copy and appends a version snapshot', async () => {
    articleRows = [makeArticle({
        draftRevision: 2,
        draftContent: '<p>待发布正文</p>',
        draftPayload: JSON.stringify({
            title: '待发布标题',
            subsetId: 3,
            classify: 'article',
            label: '发布',
            introduce: '待发布简介',
            cover: '/api/uploads/draft.jpg',
        }),
    })]

    const result = await workflowModel.publishWorkingCopy(10, { userId: 1 })
    assert.equal(result.revision, 3)
    const update = calls.find(call =>
        call.sql.includes("state = 'published'") && call.sql.includes('draft_content = NULL')
    )
    assert.ok(update)
    assert.equal(update.values[0], '待发布标题')
    assert.equal(update.values[4], '<p>待发布正文</p>')
    assert.ok(calls.some(call => call.sql.includes('INSERT INTO article_version')))
})

test('restoring a version creates a new rollback snapshot instead of overwriting history', async () => {
    versionRows = [{
        id: 8,
        articleId: 10,
        revision: 2,
        title: '旧标题',
        subsetId: 1,
        classify: 'article',
        label: '旧标签',
        introduce: '旧简介',
        content: '<p>旧正文</p>',
        cover: '/api/uploads/old.jpg',
        state: 'published',
    }]
    articleRows = [makeArticle({ draftRevision: 5 })]

    const result = await workflowModel.restoreVersion(10, 8, { userId: 1 })
    assert.equal(result.found, true)
    assert.equal(result.revision, 6)
    const versionInsert = calls.find(call => call.sql.includes('INSERT INTO article_version'))
    assert.equal(versionInsert.values[10], 'rollback')
})

test('scheduled publishing only runs due rows and clears the schedule', async () => {
    dueRows = [{ id: 10, userId: 1, classify: 'article' }]
    articleRows = [makeArticle({
        scheduledAt: '2026-10-01T00:00:00.000Z',
        draftRevision: 2,
        draftContent: '<p>定时正文</p>',
        draftPayload: JSON.stringify({ title: '定时标题', classify: 'article' }),
    })]

    const due = await workflowModel.findDueScheduledArticles(20)
    assert.equal(due.length, 1)

    const result = await workflowModel.publishScheduledArticle(10)
    assert.equal(result.published, true)
    const update = calls.find(call =>
        call.sql.includes("state = 'published'") && call.sql.includes('scheduled_at = NULL')
    )
    assert.ok(update)
    assert.equal(update.values[0], '定时标题')
    assert.ok(calls.some(call =>
        call.sql.includes('INSERT INTO article_version') && call.values[10] === 'scheduled'
    ))
})

test('workflow controller returns 409 for stale revisions and 403 without publish scope', async () => {
    articleRows = [makeArticle({ draftRevision: 2 })]
    transactionHandler = (sql) => {
        if (sql.includes('SELECT') && sql.includes('FROM article')) {
            return articleRows
        }
        return { affectedRows: 1 }
    }

    const stale = makeResponse()
    await controller.saveDraft({
        params: { id: '10' },
        body: {
            title: '标题',
            content: '<p>正文</p>',
            classify: 'article',
            revision: 1,
        },
        user: { userId: 1, permissions: ['article.manageOwn'] },
    }, stale)
    assert.equal(stale.statusCode, 409)

    const denied = makeResponse()
    const originalScope = require('../utils/accessControl').getArticleScope
    await controller.scheduleWorkflow({
        params: { id: '10' },
        body: { scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        user: { userId: 1, permissions: ['article.manageOwn'] },
    }, denied)
    assert.equal(denied.statusCode, 403)
})

test('scheduler publishes due rows and records an audit log', async () => {
    dueRows = [{ id: 10, userId: 1, classify: 'article' }]
    articleRows = [makeArticle({
        scheduledAt: '2026-10-01T00:00:00.000Z',
        draftRevision: 1,
        draftContent: '<p>定时正文</p>',
        draftPayload: JSON.stringify({ title: '定时标题', classify: 'article' }),
    })]
    // startArticleScheduler 启动时会自动扫描一次，手动 runOnce 是第二次；
    // 第一次发布后把 article 行移出 due 列表，避免同一测试内重复发布。
    transactionHandler = (sql) => {
        if (sql.includes("state = 'published'") && sql.includes('scheduled_at = NULL')) {
            dueRows = []
            articleRows = articleRows.map(row => ({ ...row, scheduledAt: null }))
            return { affectedRows: 1 }
        }
        return { affectedRows: 1 }
    }

    const runner = scheduler.startArticleScheduler({ intervalMs: 60_000 })
    await new Promise(resolve => setImmediate(resolve))
    await runner.runOnce()
    runner.stop()

    assert.ok(calls.some(call =>
        call.sql === 'LOG' && call.values[0].detail === '定时发布已执行'
    ))
})

test('promoting the working copy moves it online and clears the draft fields', async () => {
    articleRows = [makeArticle({
        title: '线上标题',
        content: '<p>线上正文</p>',
        draftContent: '<p>工作稿正文</p>',
        draftPayload: JSON.stringify({
            title: '工作稿标题',
            subsetId: 5,
            classify: 'article',
            label: '工作流',
            introduce: '工作稿简介',
            cover: '/api/uploads/draft.jpg',
        }),
    })]

    const result = await workflowModel.promoteWorkingCopy(10)
    assert.equal(result.promoted, true)

    const update = calls.find(call =>
        call.sql.includes('UPDATE article') && call.sql.includes('draft_content = NULL')
    )
    assert.ok(update)
    assert.equal(update.values[0], '工作稿标题')
    assert.equal(update.values[4], '<p>工作稿正文</p>')
    assert.equal(update.values[5], '/api/uploads/draft.jpg')
})

test('gallery versions report the number of photos', async () => {
    versionRows = [{
        id: 3,
        articleId: 11,
        revision: 1,
        title: '图库版本',
        subsetId: null,
        classify: 'image',
        label: '',
        introduce: '',
        cover: '/api/uploads/1.jpg',
        state: 'published',
        source: 'autosave',
        content: JSON.stringify(['/api/uploads/1.jpg', '/api/uploads/2.jpg']),
    }]

    const result = await workflowModel.listVersions(11, { page: 1, pageSize: 10 })
    assert.equal(result.total, 1)
    assert.equal(Number(result.list[0].mediaCount), 2)
})
