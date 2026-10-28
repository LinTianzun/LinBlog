const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const diaryModelPath = path.resolve(__dirname, '../model/dbModel/diary/index.js')
const commentModelPath = path.resolve(__dirname, '../model/dbModel/comment/index.js')
const overviewControllerPath = path.resolve(__dirname, '../controller/overviewController.js')
const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')
const fileModelPath = path.resolve(__dirname, '../model/dbModel/file/index.js')
const messageModelPath = path.resolve(__dirname, '../model/dbModel/message/index.js')

const diaryModel = require(diaryModelPath)
const commentModel = require(commentModelPath)

function makeRes() {
    return {
        statusCode: 200,
        payload: undefined,
        status(code) { this.statusCode = code; return this },
        json(payload) { this.payload = payload; return this },
    }
}

// 用假库重新加载模型，确保测到的是带归属过滤的最新实现
function reloadWithFakeDb(modelPath, extraStubs = {}) {
    const queries = []
    const fakeDb = {
        async query(sql, values = []) {
            queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), values })
            if (/AS weatherName/.test(sql)) return []
            if (/COUNT\(\*\) AS total/.test(sql)) return [{ total: 0 }]
            return []
        },
    }

    const originalLoad = Module._load
    Module._load = function (request, parent) {
        if (parent && parent.filename === modelPath && request === '../../db/dbnew') return fakeDb
        if (parent && parent.filename === modelPath && extraStubs[request]) {
            return extraStubs[request]
        }
        return originalLoad.call(this, request, parent)
    }
    delete require.cache[modelPath]
    const model = require(modelPath)
    Module._load = originalLoad

    return { model, queries, restore: () => delete require.cache[modelPath] }
}

test('随笔 SQL 按归属过滤：普通用户加 owner 条件，管理员不加', async () => {
    const { model: scopedModel, queries, restore } = reloadWithFakeDb(diaryModelPath)

    await scopedModel.getDiariesByPage({
        pageSize: 10,
        offset: 0,
        ownerScope: { userId: 42, userType: 'normal' },
    })
    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.match(listSql.sql, /d\.user_id = \?/)
    // 列表要回传归属作者，前端才能逐条判定「管理自己的随笔」
    assert.match(listSql.sql, /SELECT d\.id, d\.user_id,/)
    assert.ok(listSql.values.includes(42))

    queries.length = 0
    await scopedModel.getDiariesByPage({
        pageSize: 10,
        offset: 0,
        ownerScope: { userId: 42, userType: 'admin' },
    })
    const adminSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.doesNotMatch(adminSql.sql, /d\.user_id = \?/)

    queries.length = 0
    await scopedModel.getDiariesByPage({
        pageSize: 10,
        offset: 0,
        ownerScope: { userId: 42, userType: 'visitor' },
    })
    const visitorSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    // 游客不应通过后台接口看到任何随笔
    assert.match(visitorSql.sql, /1 = 0/)
    restore()
})

test('评论列表按归属收窄：普通用户只看自己作品的评论或自己的评论', async () => {
    const { model: scopedCommentModel, queries, restore } = reloadWithFakeDb(commentModelPath, {
        // liked 集合查询与归属断言无关，返回空集合即可
        '../commentInteraction/index': { findLikedIds: async () => new Set() },
    })

    await scopedCommentModel.getCommentsByPage(1, 10, 0, null, 42, {
        userId: 42,
        userType: 'normal',
    })

    const listSql = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    const countSql = queries.find(q => q.sql.startsWith('SELECT COUNT(*) AS total'))
    for (const sql of [listSql.sql, countSql.sql]) {
        assert.match(sql, /\(a\.user_id = \? OR c\.user_id = \?\)/)
    }
    // 归属参数成对出现，末尾才是分页参数
    assert.deepEqual(listSql.values, [42, 42, 10, 0])
    // 总数查询必须 JOIN article，否则归属条件会引用不存在的表
    assert.match(countSql.sql, /LEFT JOIN article a ON c\.article_id = a\.id/)

    queries.length = 0
    await scopedCommentModel.getCommentsByPage(1, 10, 0, null, 42, {
        userId: 42,
        userType: 'admin',
    })
    const adminList = queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))
    assert.doesNotMatch(adminList.sql, /a\.user_id = \? OR c\.user_id = \?/)
    restore()
})

test('总览随笔与评论计数按当前用户收窄', async () => {
    const captured = []
    const stubs = {
        '../model/dbModel/article/index': {
            countArticlesByState: async () => ({ all: 0 }),
        },
        '../model/dbModel/file/index': {
            countFilesSummary: async () => {
                captured.push({ target: 'file', args: null })
                return { totalSize: 0 }
            },
        },
        '../model/dbModel/message/index': {
            getUnreadCount: async () => 0,
        },
        '../model/dbModel/diary/index': {
            getDiariesByPage: async (args) => {
                captured.push({ target: 'diary', args })
                return { list: [], total: 0 }
            },
        },
        '../model/dbModel/comment/index': {
            getCommentsByPage: async (...args) => {
                captured.push({ target: 'comment', args })
                return { list: [], total: 0, page: 1, pageSize: 1, totalPage: 0 }
            },
        },
    }

    const originalLoad = Module._load
    Module._load = function (request, parent) {
        if (parent && parent.filename === overviewControllerPath && stubs[request]) {
            return stubs[request]
        }
        return originalLoad.call(this, request, parent)
    }
    delete require.cache[overviewControllerPath]
    const scopedController = require(overviewControllerPath)
    Module._load = originalLoad

    const res = makeRes()
    await scopedController.getOverviewSummary(
        { user: { userId: 9, userType: 'normal' } },
        res
    )

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.data.file, null)
    assert.equal(captured.some(call => call.target === 'file'), false)
    const diaryCall = captured.find(call => call.target === 'diary')
    assert.deepEqual(diaryCall.args.ownerScope, { userId: 9, userType: 'normal' })

    const commentCall = captured.find(call => call.target === 'comment')
    assert.deepEqual(commentCall.args[5], { userId: 9, userType: 'normal' })

    delete require.cache[overviewControllerPath]
})

test('分类计数按归属收窄：普通用户加 user_id，管理员不加', async () => {
    const subsetModelPath = path.resolve(__dirname, '../model/dbModel/subset/index.js')
    const { model: scopedSubsetModel, queries, restore } = reloadWithFakeDb(subsetModelPath)

    await scopedSubsetModel.findSubsets({
        classify: 'article',
        includeCount: true,
        countClassify: 'image',
        countUserId: 42,
    })
    const normalSql = queries.find(q => q.sql.includes('FROM subset'))
    assert.match(normalSql.sql, /a\.user_id = \?/)
    assert.deepEqual(normalSql.values, ['image', 42, 'article'])

    queries.length = 0
    await scopedSubsetModel.findSubsets({
        classify: 'article',
        includeCount: true,
        countClassify: 'image',
    })
    const adminSql = queries.find(q => q.sql.includes('FROM subset'))
    assert.doesNotMatch(adminSql.sql, /a\.user_id = \?/)
    assert.deepEqual(adminSql.values, ['image', 'article'])
    restore()
})
