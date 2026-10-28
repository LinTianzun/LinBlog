const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const viewControllerPath = path.resolve(__dirname, '../controller/viewController.js')
const originalLoad = Module._load

// 模拟目标是否存在：article/image/diary 分别单独控制，便于验证 404 分支
let visible = { article: true, image: true, diary: true }

const callLog = { queries: [], inserts: [], updates: [], deletes: [] }
let viewCount = 7
let recentRows = []

const viewModel = {
    normalizeTargetType: (type) => (type === 'gallery' ? 'image' : type),
    async recordView(targetType, targetId, identifier) {
        callLog.inserts.push({ targetType, targetId, identifier })
        const counted = recentRows.length === 0
        return { counted, views: counted ? viewCount + 1 : viewCount }
    }
}

const articleModel = {
    async findAtricleById() {
        return visible.article ? { id: 5, title: '已发布文章' } : null
    }
}

const diaryModel = {
    async findDiaryById() {
        return visible.diary ? { id: 9, title: '随笔' } : null
    }
}

Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === viewControllerPath) {
        if (request === '../model/dbModel/view/index') return viewModel
        if (request === '../model/dbModel/article/index') return articleModel
        if (request === '../model/dbModel/diary/index') return diaryModel
    }
    return originalLoad.call(this, request, parent, isMain)
}

const { recordView, buildIdentifier } = require(viewControllerPath)
Module._load = originalLoad

function makeResponse() {
    return {
        statusCode: 200,
        payload: undefined,
        status(code) {
            this.statusCode = code
            return this
        },
        json(payload) {
            this.payload = payload
            return this
        }
    }
}

const baseReq = (body, user = null, userAgent = 'Mozilla/5.0 Chrome/128') => ({
    body,
    user,
    ip: '127.0.0.1',
    headers: { 'user-agent': userAgent }
})

const guestIdentifier = (ip, userAgent) =>
    `g:${crypto.createHash('sha256').update(`${ip}\n${userAgent}`).digest('hex').slice(0, 40)}`

test.beforeEach(() => {
    visible = { article: true, image: true, diary: true }
    recentRows = []
    viewCount = 7
    callLog.inserts.length = 0
})

test('匿名用户按 IP+UA 哈希生成访客标识，不落明文 IP', () => {
    const identifier = buildIdentifier(baseReq({}))
    assert.equal(identifier, guestIdentifier('127.0.0.1', 'Mozilla/5.0 Chrome/128'))
    assert.ok(identifier.startsWith('g:'))
    assert.ok(identifier.length <= 120)
    assert.ok(!identifier.includes('127.0.0.1'))
})

test('同一 IP 不同 UA 视为不同访客，同 IP 同 UA 标识稳定', () => {
    const first = buildIdentifier(baseReq({}, null, 'Mozilla/5.0 Chrome/128'))
    const second = buildIdentifier(baseReq({}, null, 'Mozilla/5.0 Firefox/130'))
    const repeat = buildIdentifier(baseReq({}, null, 'Mozilla/5.0 Chrome/128'))

    assert.notEqual(first, second)
    assert.equal(first, repeat)
})

test('缺少 User-Agent 时仍生成有效标识', () => {
    const req = baseReq({})
    delete req.headers['user-agent']
    const identifier = buildIdentifier(req)

    assert.equal(identifier, guestIdentifier('127.0.0.1', ''))
})

test('登录用户按用户ID生成访客标识', () => {
    const identifier = buildIdentifier(baseReq({}, { userId: 42 }))
    assert.equal(identifier, 'u:42')
})

test('已发布文章记录浏览并返回浏览量', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'article', targetId: 5 }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.code, 200)
    assert.equal(res.payload.data.targetType, 'article')
    assert.equal(res.payload.data.targetId, 5)
    assert.equal(res.payload.data.counted, true)
    assert.equal(res.payload.data.views, 8)
    assert.deepEqual(callLog.inserts[0], {
        targetType: 'article',
        targetId: 5,
        identifier: guestIdentifier('127.0.0.1', 'Mozilla/5.0 Chrome/128')
    })
})

test('gallery 类型归一化到 image', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'gallery', targetId: 5 }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.data.targetType, 'image')
})

test('随笔浏览走 diary 目标', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'diary', targetId: 9 }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.data.targetType, 'diary')
    assert.equal(res.payload.data.targetId, 9)
})

test('不支持的目标类型返回 400', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'file', targetId: 1 }), res)

    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 400)
    assert.equal(callLog.inserts.length, 0)
})

test('目标ID非法时返回 400 且不写库', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'article', targetId: -1 }), res)

    assert.equal(res.statusCode, 400)
    assert.equal(callLog.inserts.length, 0)
})

test('目标ID非数字时返回 400', async () => {
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'article', targetId: 'abc' }), res)

    assert.equal(res.statusCode, 400)
    assert.equal(callLog.inserts.length, 0)
})

test('未发布文章不计数，返回 404', async () => {
    visible.article = false
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'article', targetId: 5 }), res)

    assert.equal(res.statusCode, 404)
    assert.equal(callLog.inserts.length, 0)
})

test('已删除随笔不计数，返回 404', async () => {
    visible.diary = false
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'diary', targetId: 9 }), res)

    assert.equal(res.statusCode, 404)
    assert.equal(callLog.inserts.length, 0)
})

test('去重窗口内命中时不计数', async () => {
    recentRows = [{ id: 1 }]
    const res = makeResponse()
    await recordView(baseReq({ targetType: 'article', targetId: 5 }), res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.data.counted, false)
    assert.equal(res.payload.data.views, 7)
})

test('模型抛错时返回 500', async () => {
    const boomViewModel = {
        normalizeTargetType: (type) => type,
        async recordView() {
            throw new Error('数据库连接失败')
        }
    }
    Module._load = function (request, parent, isMain) {
        if (parent && parent.filename === viewControllerPath) {
            if (request === '../model/dbModel/view/index') return boomViewModel
            if (request === '../model/dbModel/article/index') return articleModel
            if (request === '../model/dbModel/diary/index') return diaryModel
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[viewControllerPath]
    const { recordView: boomRecordView } = require(viewControllerPath)
    delete require.cache[viewControllerPath]
    Module._load = originalLoad

    const res = makeResponse()
    await boomRecordView(baseReq({ targetType: 'article', targetId: 5 }), res)

    assert.equal(res.statusCode, 500)
    assert.match(res.payload.message, /数据库连接失败/)
})
