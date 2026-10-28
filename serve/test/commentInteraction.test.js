const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const modelPath = path.resolve(__dirname, '../model/dbModel/commentInteraction/index.js')
const controllerPath = path.resolve(__dirname, '../controller/commentInteractionController.js')
const originalLoad = Module._load

let queryHandler = async () => []
let transactionHandler = async (callback) => callback(null)
let queryCalls = []
let transactionCount = 0
let toggleResult = null
let reportResult = null
let deleteResult = 0
let deleteCalls = []
let logCalls = []

const interactionStub = {
    normalizeTargetType(value) {
        return value === 'article' || value === 'diary' ? value : null
    },
    parseCommentId(value) {
        const parsed = Number(value)
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
    },
    async toggleLike() {
        return toggleResult
    },
    async report() {
        return reportResult
    },
    async deleteComment(targetType, commentId, userId, userType) {
        deleteCalls.push({ targetType, commentId, userId, userType })
        return deleteResult
    }
}

Module._load = function (request, parent, isMain) {
    const filename = parent && parent.filename
    if (filename === modelPath && request === '../../db/dbnew') {
        return {
            query(sql, values) {
                queryCalls.push({ sql, values })
                return queryHandler(sql, values)
            },
            withTransaction(callback) {
                transactionCount += 1
                return transactionHandler(callback)
            }
        }
    }
    if (filename === controllerPath) {
        if (request === '../model/dbModel/commentInteraction/index') return interactionStub
        if (request === '../utils/logHelper') {
            return { writeSystemLog: entry => logCalls.push(entry) }
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}

delete require.cache[modelPath]
delete require.cache[controllerPath]
const interactionModel = require(modelPath)
const controller = require(controllerPath)
Module._load = originalLoad

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

test.beforeEach(() => {
    queryHandler = async () => []
    transactionHandler = async (callback) => callback(null)
    queryCalls = []
    transactionCount = 0
    toggleResult = null
    reportResult = null
    deleteResult = 0
    deleteCalls = []
    logCalls = []
})

test('评论互动只接受 article/diary 和正整数评论 ID', () => {
    assert.equal(interactionModel.normalizeTargetType('article'), 'article')
    assert.equal(interactionModel.normalizeTargetType('diary'), 'diary')
    assert.equal(interactionModel.normalizeTargetType('image'), null)
    assert.equal(interactionModel.parseCommentId('12'), 12)
    assert.equal(interactionModel.parseCommentId('1.5'), null)
    assert.equal(interactionModel.parseCommentId(0), null)
})

test('findLikedIds 批量返回当前用户点赞过的评论', async () => {
    queryHandler = async () => [{ comment_id: 11 }, { comment_id: '12' }]

    const result = await interactionModel.findLikedIds('article', [11, '12', 0, 'bad'], 7)

    assert.deepEqual([...result], [11, 12])
    assert.equal(queryCalls.length, 1)
    assert.match(queryCalls[0].sql, /FROM comment_praise/)
    assert.deepEqual(queryCalls[0].values, ['article', 7, 11, 12])
})

test('findLikedIds 匿名或空列表时直接返回空集合', async () => {
    const anonymous = await interactionModel.findLikedIds('article', [1], null)
    const empty = await interactionModel.findLikedIds('article', [], 7)

    assert.equal(anonymous.size, 0)
    assert.equal(empty.size, 0)
    assert.equal(queryCalls.length, 0)
})

test('点赞会锁定公开评论并在同一事务内维护明细与计数', async () => {
    const executed = []
    transactionHandler = async (callback) => callback({
        query(sql, values, done) {
            executed.push({ sql, values })
            if (sql.includes('SELECT c.id, c.likes FROM comment')) {
                done(null, [{ id: 3, likes: 2 }])
            } else if (sql.includes('SELECT id FROM comment_praise')) {
                done(null, [])
            } else if (sql.includes('INSERT INTO comment_praise')) {
                done(null, { insertId: 1 })
            } else if (sql.includes('UPDATE comment SET likes = likes + 1')) {
                done(null, { affectedRows: 1 })
            } else if (sql === 'SELECT likes FROM comment WHERE id = ?') {
                done(null, [{ likes: 3 }])
            } else {
                done(new Error(`unexpected SQL: ${sql}`))
            }
        }
    })

    const result = await interactionModel.toggleLike('article', 3, 7)

    assert.deepEqual(result, { liked: true, likes: 3 })
    assert.equal(transactionCount, 1)
    assert.match(executed[0].sql, /a\.state = 'published'/)
    assert.match(executed[0].sql, /FOR UPDATE/)
})

test('重复举报不重复累计 complaint', async () => {
    const executed = []
    transactionHandler = async (callback) => callback({
        query(sql, values, done) {
            executed.push({ sql, values })
            if (sql.includes('SELECT c.id, c.likes FROM comment')) {
                done(null, [{ id: 3, likes: 1 }])
            } else if (sql.includes('INSERT INTO comment_report')) {
                const error = new Error('duplicate')
                error.code = 'ER_DUP_ENTRY'
                done(error)
            } else if (sql === 'SELECT complaint FROM comment WHERE id = ?') {
                done(null, [{ complaint: 2 }])
            } else {
                done(new Error(`unexpected SQL: ${sql}`))
            }
        }
    })

    const result = await interactionModel.report('article', 3, 7)

    assert.deepEqual(result, { complaint: 2, already: true })
    assert.equal(executed.some(call => call.sql.includes('complaint = complaint + 1')), false)
})

test('游客点赞和举报均返回 401 且不写库', async () => {
    for (const handler of [controller.toggleLike, controller.report]) {
        const res = makeResponse()
        await handler({
            body: { commentType: 'article', commentId: 3 },
            user: { userId: null, userType: 'visitor' }
        }, res)
        assert.equal(res.statusCode, 401)
    }
    assert.equal(logCalls.length, 0)
})

test('评论互动参数非法时返回 400', async () => {
    for (const body of [
        { commentType: 'image', commentId: 3 },
        { commentType: 'article', commentId: '0' },
        { commentType: 'article', commentId: '1.5' }
    ]) {
        const res = makeResponse()
        await controller.toggleLike({
            body,
            user: { userId: 7, userType: 'normal' }
        }, res)
        assert.equal(res.statusCode, 400)
    }
})

test('登录用户点赞成功并写系统日志', async () => {
    toggleResult = { liked: true, likes: 6 }
    const res = makeResponse()

    await controller.toggleLike({
        body: { commentType: 'diary', commentId: '9' },
        user: { userId: 7, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { liked: true, likes: 6 })
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].action, 'update')
    assert.equal(logCalls[0].targetType, 'diary_comment')
})

test('重复举报返回 already 且不写重复日志', async () => {
    reportResult = { complaint: 2, already: true }
    const res = makeResponse()

    await controller.report({
        body: { commentType: 'article', commentId: 3 },
        user: { userId: 7, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.already, true)
    assert.match(res.body.message, /已举报/)
    assert.equal(logCalls.length, 0)
})

test('删除评论按 targetType 分发并回退对应计数', async () => {
    // 随笔评论：UPDATE diary_comment，再回退 diary.comments
    queryHandler = async (sql) => {
        if (sql.includes('UPDATE diary_comment SET status = 0')) return { affectedRows: 1 }
        if (sql.includes('UPDATE diary d')) return { affectedRows: 1 }
        return []
    }
    const diaryAffected = await interactionModel.deleteComment('diary', 5, 7, 'normal')
    assert.equal(diaryAffected, 1)

    const update = queryCalls.find(call => call.sql.includes('UPDATE diary_comment SET status = 0'))
    assert.deepEqual(update.values, [5, 7])
    assert.match(update.sql, /user_id = \? AND status = 1/)
    assert.ok(queryCalls.some(call => call.sql.includes('UPDATE diary d')))

    // 文章评论：UPDATE comment，再回退 article.comments
    queryCalls = []
    queryHandler = async (sql) => {
        if (sql.includes('UPDATE comment SET status = 0')) return { affectedRows: 1 }
        if (sql.includes('UPDATE article a')) return { affectedRows: 1 }
        return []
    }
    const articleAffected = await interactionModel.deleteComment('article', 6, 7, 'admin')
    assert.equal(articleAffected, 1)

    const adminUpdate = queryCalls.find(call => call.sql.includes('UPDATE comment SET status = 0'))
    assert.deepEqual(adminUpdate.values, [6])
    assert.match(adminUpdate.sql, /WHERE id = \? AND status = 1/)
    assert.ok(queryCalls.some(call => call.sql.includes('UPDATE article a')))
})

test('删除未命中时不回退计数，非法类型直接返回 0 且不查库', async () => {
    queryHandler = async () => ({ affectedRows: 0 })
    assert.equal(await interactionModel.deleteComment('article', 6, 7, 'normal'), 0)
    assert.equal(queryCalls.length, 1, '未命中时不应执行计数回退')

    queryCalls = []
    assert.equal(await interactionModel.deleteComment('image', 6, 7, 'admin'), 0)
    assert.equal(await interactionModel.deleteComment('article', 0, 7, 'admin'), 0)
    assert.equal(queryCalls.length, 0)
})

test('游客删除评论返回 401 且不写库', async () => {
    const res = makeResponse()
    await controller.deleteComment({
        body: { commentType: 'diary', commentId: 5 },
        user: { userId: null, userType: 'visitor' }
    }, res)

    assert.equal(res.statusCode, 401)
    assert.equal(deleteCalls.length, 0)
    assert.equal(logCalls.length, 0)
})

test('删除随笔评论成功并写系统日志', async () => {
    deleteResult = 1
    const res = makeResponse()

    await controller.deleteComment({
        body: { commentType: 'diary', commentId: 5 },
        user: { userId: 7, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(deleteCalls, [{ targetType: 'diary', commentId: 5, userId: 7, userType: 'normal' }])
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].action, 'delete')
    assert.equal(logCalls[0].targetType, 'diary_comment')
})

test('无权删除时返回 403 且不写日志，不泄露评论是否存在', async () => {
    deleteResult = 0
    const res = makeResponse()

    await controller.deleteComment({
        body: { commentType: 'article', commentId: 5 },
        user: { userId: 7, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 403)
    assert.equal(logCalls.length, 0)
})

test('删除评论入参非法时返回 400 且不写库', async () => {
    for (const body of [
        { commentType: 'image', commentId: 5 },
        { commentType: 'diary', commentId: '0' }
    ]) {
        const res = makeResponse()
        await controller.deleteComment({ body, user: { userId: 7, userType: 'admin' } }, res)
        assert.equal(res.statusCode, 400)
    }
    assert.equal(deleteCalls.length, 0)
})
