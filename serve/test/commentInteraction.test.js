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
let reportCalls = []
let deleteResult = 0
let deleteCalls = []
let logCalls = []
let listReportsResult = null
let listReportsCalls = []
let updateReportStatusResult = false
let updateReportStatusCalls = []

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
    async report(...args) {
        reportCalls.push(args)
        return reportResult
    },
    async deleteComment(targetType, commentId, userId, userType) {
        deleteCalls.push({ targetType, commentId, userId, userType })
        return deleteResult
    },
    async listReports(options) {
        listReportsCalls.push(options)
        return listReportsResult
    },
    async updateReportStatus(id, status, handledBy) {
        updateReportStatusCalls.push({ id, status, handledBy })
        return updateReportStatusResult
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

// 删除评论现在走事务：把事务连接适配到现有 queryHandler，便于断言 SQL
function useTransactionalQuery() {
    transactionHandler = async (callback) => callback({
        query(sql, values, done) {
            queryCalls.push({ sql, values })
            Promise.resolve(queryHandler(sql, values)).then(
                result => done(null, result),
                error => done(error)
            )
        }
    })
}

test.beforeEach(() => {
    queryHandler = async () => []
    useTransactionalQuery()
    queryCalls = []
    transactionCount = 0
    toggleResult = null
    reportResult = null
    reportCalls = []
    deleteResult = 0
    deleteCalls = []
    logCalls = []
    listReportsResult = null
    listReportsCalls = []
    updateReportStatusResult = false
    updateReportStatusCalls = []
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
            if (sql.includes('SELECT c.id, c.likes, c.user_id FROM comment')) {
                done(null, [{ id: 3, likes: 2, user_id: 9 }])
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
            if (sql.includes('SELECT c.id, c.likes, c.user_id FROM comment')) {
                done(null, [{ id: 3, likes: 1, user_id: 9 }])
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

    const result = await interactionModel.report('article', 3, 7, 'spam', '重复广告')

    assert.deepEqual(result, { complaint: 2, already: true })
    assert.equal(executed.some(call => call.sql.includes('complaint = complaint + 1')), false)
    const insert = executed.find(call => call.sql.includes('INSERT INTO comment_report'))
    assert.deepEqual(insert.values, ['article', 3, 7, 'spam', '重复广告'])
})

test('不能举报自己的评论', async () => {
    const executed = []
    transactionHandler = async (callback) => callback({
        query(sql, values, done) {
            executed.push({ sql, values })
            if (sql.includes('SELECT c.id, c.likes, c.user_id FROM comment')) {
                done(null, [{ id: 3, likes: 1, user_id: 7 }])
            } else if (sql === 'SELECT complaint FROM comment WHERE id = ?') {
                done(null, [{ complaint: 1 }])
            } else {
                done(new Error(`unexpected SQL: ${sql}`))
            }
        }
    })

    const result = await interactionModel.report('article', 3, 7, 'abuse', null)

    assert.deepEqual(result, { complaint: 1, already: false, self: true })
    assert.equal(executed.some(call => call.sql.includes('INSERT INTO comment_report')), false)
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

test('举报必须选择有效原因且补充说明不超过 200 字', async () => {
    for (const body of [
        { commentType: 'article', commentId: 3 },
        { commentType: 'article', commentId: 3, reason: 'unknown' },
        { commentType: 'article', commentId: 3, reason: 'spam', detail: 'x'.repeat(201) }
    ]) {
        const res = makeResponse()
        await controller.report({
            body,
            user: { userId: 7, userType: 'normal', permissions: ['comment.report'] }
        }, res)
        assert.equal(res.statusCode, 400)
    }
    assert.equal(reportCalls.length, 0)
})

test('举报自己的评论返回 400 且不写日志', async () => {
    reportResult = { complaint: 1, already: false, self: true }
    const res = makeResponse()

    await controller.report({
        body: { commentType: 'article', commentId: 3, reason: 'spam', detail: '广告' },
        user: { userId: 7, userType: 'normal', permissions: ['comment.report'] }
    }, res)

    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /自己的评论/)
    assert.equal(logCalls.length, 0)
})

test('重复举报返回 already 且不写重复日志', async () => {
    reportResult = { complaint: 2, already: true }
    const res = makeResponse()

    await controller.report({
        body: { commentType: 'article', commentId: 3, reason: 'spam', detail: '广告' },
        user: { userId: 7, userType: 'normal' }
    }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.already, true)
    assert.match(res.body.message, /已举报/)
    assert.deepEqual(reportCalls[0], ['article', 3, 7, 'spam', '广告'])
    assert.equal(logCalls.length, 0)
})

test('删除评论按 targetType 分发并回退对应计数', async () => {
    // 随笔评论：UPDATE diary_comment，再回退 diary.comments
    queryHandler = async (sql) => {
        if (sql.includes('SELECT id, parent_id FROM diary_comment')) {
            return [{ id: 5, parent_id: 0 }]
        }
        if (/UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(sql)) return { affectedRows: 1 }
        if (sql.includes('UPDATE diary d')) return { affectedRows: 1 }
        return []
    }
    const diaryAffected = await interactionModel.deleteComment('diary', 5, 7, 'normal')
    assert.equal(diaryAffected, 1)

    const update = queryCalls.find(call => /UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(call.sql))
    assert.deepEqual(update.values, [5, 5])
    assert.match(update.sql, /id = \? OR parent_id = \?/)
    const targetSelect = queryCalls.find(call => call.sql.includes('SELECT id, parent_id FROM diary_comment'))
    assert.deepEqual(targetSelect.values, [5, 7])
    assert.match(targetSelect.sql, /user_id = \? AND status = 1/)
    assert.ok(queryCalls.some(call => call.sql.includes('UPDATE diary d')))

    // 文章评论：UPDATE comment，再回退 article.comments
    queryCalls = []
    queryHandler = async (sql) => {
        if (sql.includes('SELECT id, parent_id FROM comment')) {
            return [{ id: 6, parent_id: 0 }]
        }
        if (/UPDATE\s+comment\s+SET\s+status\s*=\s*0/.test(sql)) return { affectedRows: 1 }
        if (sql.includes('UPDATE article')) return { affectedRows: 1 }
        return []
    }
    const articleAffected = await interactionModel.deleteComment('article', 6, 7, 'admin')
    assert.equal(articleAffected, 1)

    const adminUpdate = queryCalls.find(call => /UPDATE\s+comment\s+SET\s+status\s*=\s*0/.test(call.sql))
    assert.deepEqual(adminUpdate.values, [6, 6])
    assert.match(adminUpdate.sql, /id = \? OR parent_id = \?/)
    assert.ok(queryCalls.some(call => call.sql.includes('UPDATE article')))
})

test('删除未命中时不回退计数，非法类型直接返回 0 且不查库', async () => {
    queryHandler = async () => []
    assert.equal(await interactionModel.deleteComment('article', 6, 7, 'normal'), 0)
    assert.equal(queryCalls.length, 1, '未命中时只应执行目标查询')

    queryCalls = []
    assert.equal(await interactionModel.deleteComment('image', 6, 7, 'admin'), 0)
    assert.equal(await interactionModel.deleteComment('article', 0, 7, 'admin'), 0)
    assert.equal(queryCalls.length, 0)
})

test('删除一级评论会连带回复并按实际条数回退计数', async () => {
    queryHandler = async (sql) => {
        if (sql.includes('SELECT id, parent_id FROM diary_comment')) {
            return [{ id: 5, parent_id: 0 }]
        }
        if (/UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(sql)) return { affectedRows: 3 }
        if (sql.includes('UPDATE diary d')) return { affectedRows: 1 }
        return []
    }

    const affected = await interactionModel.deleteComment('diary', 5, 7, 'admin')

    assert.equal(affected, 3)
    const countUpdate = queryCalls.find(call => call.sql.includes('UPDATE diary d'))
    assert.deepEqual(countUpdate.values, [3, 5])
})

test('删除二级回复时只删除自身，不连带根评论', async () => {
    queryHandler = async (sql) => {
        if (sql.includes('SELECT id, parent_id FROM diary_comment')) {
            return [{ id: 8, parent_id: 5 }]
        }
        if (/UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(sql)) return { affectedRows: 1 }
        if (sql.includes('UPDATE diary d')) return { affectedRows: 1 }
        return []
    }

    const affected = await interactionModel.deleteComment('diary', 8, 7, 'admin')

    assert.equal(affected, 1)
    const targetUpdate = queryCalls.find(call => /UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(call.sql))
    assert.deepEqual(targetUpdate.values, [8])
    assert.doesNotMatch(targetUpdate.sql, /parent_id/)
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
    deleteResult = 3
    const res = makeResponse()

    await controller.deleteComment({
        body: { commentType: 'diary', commentId: 5 },
        user: { userId: 7, userType: 'normal' },
        ip: '127.0.0.1'
    }, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data, { deleted: 3 })
    assert.match(res.body.message, /2 条回复/)
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

test('举报处理列表按条件过滤并格式化评论与来源信息', async () => {
    queryHandler = async (sql) => {
        if (sql.includes('GROUP BY r.status, r.reason')) {
            return [
                { status: 0, reason: 'spam', total: 3 },
                { status: 1, reason: 'abuse', total: 2 },
                { status: 2, reason: 'spam', total: 1 }
            ]
        }
        if (sql.includes('SELECT COUNT(*) AS total')) {
            return [{ total: 4 }]
        }
        return [
            {
                id: 9,
                target_type: 'article',
                comment_id: 31,
                reason: 'spam',
                detail: '重复广告',
                status: 0,
                created_at: '2026-10-29T10:00:00.000Z',
                handled_at: null,
                reporter_id: 7,
                reporter_name: '举报人',
                comment_user_id: 8,
                comment_user_name: '评论人',
                comment_user_avatar: '/avatar.png',
                comment_content: '加我微信',
                comment_status: 1,
                comment_likes: 2,
                comment_complaint: 4,
                comment_created_at: '2026-10-29T09:00:00.000Z',
                article_id: 12,
                article_title: '一篇文章',
                article_classify: 'article',
                diary_id: null,
                diary_title: null,
                handler_name: null
            }
        ]
    }

    const result = await interactionModel.listReports({
        page: 2,
        pageSize: 10,
        offset: 10,
        reason: 'spam',
        targetType: 'article',
        status: 0,
        keyword: '微信'
    })

    assert.equal(result.total, 4)
    assert.equal(result.totalPage, 1)
    assert.deepEqual(result.summary, {
        total: 6,
        pending: 3,
        resolved: 2,
        dismissed: 1,
        reasons: { spam: 4, abuse: 2 }
    })
    assert.equal(result.list[0].reporter.name, '举报人')
    assert.equal(result.list[0].comment.user.name, '评论人')
    assert.equal(result.list[0].source.title, '一篇文章')

    const listCall = queryCalls.find(call => call.sql.includes('LIMIT ? OFFSET ?'))
    assert.match(listCall.sql, /r\.reason = \?/)
    assert.match(listCall.sql, /r\.status = \?/)
    assert.deepEqual(listCall.values.slice(-2), [10, 10])

    // comment_report 与 diary_comment 都有 status 列，统计查询必须限定表别名
    const summaryCall = queryCalls.find(call => call.sql.includes('GROUP BY r.status, r.reason'))
    assert.match(summaryCall.sql, /SELECT r\.status, r\.reason/)
})

test('举报来源筛选把图库从文章里独立出来', async () => {
    queryHandler = async () => []

    // SELECT 列表里本来就带 a.classify，断言只看 WHERE 条件
    const findWhere = async (targetType) => {
        queryCalls = []
        await interactionModel.listReports({ targetType })
        const sql = queryCalls.find(call => call.sql.includes('LIMIT ? OFFSET ?')).sql
        return sql.slice(sql.indexOf('WHERE'))
    }

    // 图库内容在 article 表中 classify=image，来源仍按 target_type='article' 存
    const articleSql = await findWhere('article')
    assert.match(articleSql, /r\.target_type = 'article'/)
    assert.match(articleSql, /a\.classify <> 'image'/)

    const gallerySql = await findWhere('gallery')
    assert.match(gallerySql, /r\.target_type = 'article'/)
    assert.match(gallerySql, /a\.classify = 'image'/)

    const diarySql = await findWhere('diary')
    assert.match(diarySql, /r\.target_type = 'diary'/)
    assert.doesNotMatch(diarySql, /a\.classify/)
})

test('更新举报状态只接受已处理或已忽略', async () => {
    queryHandler = async () => ({ affectedRows: 1 })
    assert.equal(await interactionModel.updateReportStatus(9, 1, 3), true)
    const update = queryCalls.find(call => call.sql.includes('UPDATE comment_report'))
    assert.deepEqual(update.values, [1, 3, 9])

    queryCalls = []
    assert.equal(await interactionModel.updateReportStatus(9, 0, 3), false)
    assert.equal(await interactionModel.updateReportStatus(9, 3, 3), false)
    assert.equal(await interactionModel.updateReportStatus(0, 1, 3), false)
    assert.equal(queryCalls.length, 0)
})

test('删除评论会把相关待处理举报标记为已处理', async () => {
    queryHandler = async (sql) => {
        if (sql.includes('SELECT id, parent_id FROM diary_comment')) {
            return [{ id: 5, parent_id: 0 }]
        }
        if (/UPDATE\s+diary_comment\s+SET\s+status\s*=\s*0/.test(sql)) return { affectedRows: 1 }
        if (sql.includes('UPDATE diary d')) return { affectedRows: 1 }
        return { affectedRows: 1 }
    }

    await interactionModel.deleteComment('diary', 5, 7, 'admin')

    const resolved = queryCalls.find(call => call.sql.includes('UPDATE comment_report'))
    assert.ok(resolved)
    assert.match(resolved.sql, /status = 1/)
    assert.deepEqual(resolved.values, [7, 'diary', 5])
})

test('举报处理接口按权限与参数校验', async () => {
    const denied = makeResponse()
    await controller.getReports({
        query: {},
        user: { userId: 7, userType: 'normal', permissions: [] }
    }, denied)
    assert.equal(denied.statusCode, 403)

    const invalidReason = makeResponse()
    await controller.getReports({
        query: { reason: 'unknown' },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] }
    }, invalidReason)
    assert.equal(invalidReason.statusCode, 400)

    const invalidSource = makeResponse()
    await controller.getReports({
        query: { targetType: 'gallery2' },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] }
    }, invalidSource)
    assert.equal(invalidSource.statusCode, 400)

    listReportsResult = {
        list: [], total: 0, page: 1, pageSize: 10, totalPage: 0,
        summary: { total: 0, pending: 0, resolved: 0, dismissed: 0, reasons: {} }
    }
    const ok = makeResponse()
    await controller.getReports({
        query: { page: '2', pageSize: '5', status: '0', reason: 'spam', targetType: 'gallery', keyword: ' 广告 ' },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] }
    }, ok)
    assert.equal(ok.statusCode, 200)
    assert.deepEqual(listReportsCalls[0], {
        page: 2,
        pageSize: 5,
        offset: 5,
        reason: 'spam',
        targetType: 'gallery',
        status: 0,
        keyword: ' 广告 '
    })
})

test('处理举报会写入日志，未命中返回 404', async () => {
    const invalid = makeResponse()
    await controller.updateReportStatus({
        params: { id: '9' },
        body: { status: 0 },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] }
    }, invalid)
    assert.equal(invalid.statusCode, 400)

    updateReportStatusResult = false
    const missing = makeResponse()
    await controller.updateReportStatus({
        params: { id: '9' },
        body: { status: 1 },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] }
    }, missing)
    assert.equal(missing.statusCode, 404)

    updateReportStatusResult = true
    const ok = makeResponse()
    await controller.updateReportStatus({
        params: { id: '9' },
        body: { status: 2 },
        user: { userId: 7, userType: 'admin', permissions: ['comment.moderate'] },
        ip: '127.0.0.1'
    }, ok)

    assert.equal(ok.statusCode, 200)
    assert.deepEqual(updateReportStatusCalls[1], { id: 9, status: 2, handledBy: 7 })
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].targetType, 'comment_report')
    assert.equal(logCalls[0].detail, '忽略举报')
})
