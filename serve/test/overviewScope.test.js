const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const overviewControllerPath = path.resolve(__dirname, '../controller/overviewController.js')
const articleModelPath = path.resolve(__dirname, '../model/dbModel/article/index.js')

function makeRes() {
    return {
        statusCode: 200,
        payload: undefined,
        status(code) { this.statusCode = code; return this },
        json(payload) { this.payload = payload; return this },
    }
}

// 用假库重新加载控制器，捕获传给 countArticlesByState 的权限范围
function reloadController() {
    const captured = []
    const stubs = {
        '../model/dbModel/article/index': {
            countArticlesByState: async (args) => {
                captured.push(args)
                return { all: 0 }
            },
        },
        '../model/dbModel/file/index': {
            countFilesSummary: async () => ({ totalSize: 0 }),
        },
        '../model/dbModel/message/index': {
            getUnreadCount: async () => 0,
        },
        '../model/dbModel/diary/index': {
            getDiariesByPage: async () => ({ list: [], total: 0 }),
        },
        '../model/dbModel/comment/index': {
            getCommentsByPage: async () => ({
                list: [], total: 0, page: 1, pageSize: 1, totalPage: 0,
            }),
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
    const controller = require(overviewControllerPath)
    Module._load = originalLoad

    return {
        controller,
        captured,
        cleanup: () => delete require.cache[overviewControllerPath],
    }
}

test('总览计数：无内容查看权限的用户（游客）不应统计全站内容', async () => {
    const { controller, captured, cleanup } = reloadController()
    const res = makeRes()

    // 游客：默认权限矩阵只有 message.private，没有任何 article/gallery/diary 相关权限
    await controller.getOverviewSummary(
        { user: { userId: 7, userType: 'visitor', permissions: ['message.private'] } },
        res
    )

    assert.equal(res.statusCode, 200)

    const articleCall = captured.find(c => c.classify === 'article')
    const galleryCall = captured.find(c => c.classify === 'image')

    // 关键断言：既不能 viewAll，也不能 viewOwn
    assert.equal(articleCall.userAccess.viewAll, false, '游客不应有 viewAll')
    assert.equal(articleCall.userAccess.viewOwn, false, '游客不应有 viewOwn')
    assert.equal(galleryCall.userAccess.viewAll, false, '游客不应有 gallery viewAll')
    assert.equal(galleryCall.userAccess.viewOwn, false, '游客不应有 gallery viewOwn')

    cleanup()
})

test('总览计数：普通用户保留自己的内容统计', async () => {
    const { controller, captured, cleanup } = reloadController()
    const res = makeRes()

    await controller.getOverviewSummary(
        {
            user: {
                userId: 9,
                userType: 'normal',
                permissions: ['article.create', 'article.manageOwn', 'diary.create', 'diary.manageOwn'],
            },
        },
        res
    )

    assert.equal(res.statusCode, 200)
    const articleCall = captured.find(c => c.classify === 'article')
    assert.equal(articleCall.userAccess.viewOwn, true, '普通用户应能统计自己的文章')

    cleanup()
})

test('文章计数：无查看权限时不得回退到「全站已发布」', async () => {
    // 直接测模型层：viewAll=false 且 viewOwn=false 时应返回空集，
    // 而不是把全站 published 内容全部数出来
    const queries = []
    const fakeDb = {
        async query(sql, values = []) {
            queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), values })
            if (/COUNT\(\*\) AS total/.test(sql)) return [{ total: 0 }]
            return []
        },
    }

    const originalLoad = Module._load
    Module._load = function (request, parent) {
        if (parent && parent.filename === articleModelPath && request === '../../db/dbnew') {
            return fakeDb
        }
        return originalLoad.call(this, request, parent)
    }
    delete require.cache[articleModelPath]
    const model = require(articleModelPath)
    Module._load = originalLoad

    const summary = await model.countArticlesByState({
        classify: 'article',
        userId: 7,
        userAccess: { viewAll: false, viewOwn: false },
    })

    // 计数结果必须是 0
    assert.equal(summary.all, 0)
    const countSql = queries.find(q => q.sql.includes('COUNT(*) AS total'))
    // SQL 上必须显式排除，而不是只加 state = 'published'
    assert.match(countSql.sql, /1 = 0/, '无权限时应显式排除所有行')
    assert.doesNotMatch(
        countSql.sql,
        /a\.state = \?[\s\S]*$/,
        '不应只按 published 过滤（那会把全站已发布内容数出来）'
    )

    delete require.cache[articleModelPath]
})
