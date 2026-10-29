const { query, withTransaction } = require('../../db/dbnew')

// 文章评论与随笔评论是两张表，用 targetType 区分；表名与可见性条件都来自白名单
const TARGETS = {
    article: {
        table: 'comment',
        // 文章评论只对已发布文章可见
        visibleSql: `SELECT c.id, c.likes, c.user_id FROM comment c
                     INNER JOIN article a ON c.article_id = a.id
                     WHERE c.id = ? AND c.status = 1 AND a.state = 'published'
                     LIMIT 1`
    },
    diary: {
        table: 'diary_comment',
        // 随笔没有草稿概念，status=1 即可见
        visibleSql: `SELECT c.id, c.likes, c.user_id FROM diary_comment c
                     INNER JOIN diary d ON c.diary_id = d.id
                     WHERE c.id = ? AND c.status = 1 AND d.status = 1
                     LIMIT 1`
    }
}

function normalizeTargetType(value) {
    return value === 'diary' ? 'diary' : value === 'article' ? 'article' : null
}

function parseCommentId(value) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * 批量查询当前用户点赞过的评论，返回 Set 便于列表标记 liked
 * @param {'article'|'diary'} targetType
 * @param {number[]} commentIds
 * @param {number|null} userId
 */
async function findLikedIds(targetType, commentIds, userId) {
    const type = normalizeTargetType(targetType)
    const ids = (Array.isArray(commentIds) ? commentIds : [])
        .map(parseCommentId)
        .filter(Boolean)
    if (!type || !userId || ids.length === 0) return new Set()

    const placeholders = ids.map(() => '?').join(', ')
    const rows = await query(
        `SELECT comment_id FROM comment_praise
         WHERE target_type = ? AND user_id = ? AND comment_id IN (${placeholders})`,
        [type, userId, ...ids]
    )
    return new Set(rows.map(row => Number(row.comment_id)))
}

/**
 * 查询单条评论的点赞状态；评论不可见时返回 null
 */
async function findLikeState(targetType, commentId, userId) {
    const type = normalizeTargetType(targetType)
    const id = parseCommentId(commentId)
    if (!type || !id) return null

    const rows = await query(TARGETS[type].visibleSql, [id])
    const row = rows[0]
    if (!row) return null

    let liked = false
    if (userId) {
        const mine = await query(
            `SELECT id FROM comment_praise
             WHERE target_type = ? AND comment_id = ? AND user_id = ? LIMIT 1`,
            [type, id, userId]
        )
        liked = mine.length > 0
    }

    return { liked, likes: Number(row.likes || 0) }
}

/**
 * 切换评论点赞（已赞则取消），点赞数与明细在同一事务内更新
 * @returns {Promise<{liked: boolean, likes: number}|null>} null 表示评论不可见
 */
async function toggleLike(targetType, commentId, userId) {
    const type = normalizeTargetType(targetType)
    const id = parseCommentId(commentId)
    if (!type || !id) return null

    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        const table = TARGETS[type].table
        // 锁定可见评论行，同时阻止对草稿文章/隐藏随笔下的评论点赞
        const rows = await run(`${TARGETS[type].visibleSql} FOR UPDATE`, [id])
        if (rows.length === 0) return null

        const existing = await run(
            `SELECT id FROM comment_praise
             WHERE target_type = ? AND comment_id = ? AND user_id = ? LIMIT 1`,
            [type, id, userId]
        )

        let liked
        if (existing.length > 0) {
            await run('DELETE FROM comment_praise WHERE id = ?', [existing[0].id])
            await run(
                `UPDATE ${table} SET likes = GREATEST(likes - 1, 0) WHERE id = ?`,
                [id]
            )
            liked = false
        } else {
            await run(
                `INSERT INTO comment_praise (target_type, comment_id, user_id) VALUES (?, ?, ?)`,
                [type, id, userId]
            )
            await run(`UPDATE ${table} SET likes = likes + 1 WHERE id = ?`, [id])
            liked = true
        }

        const [updated] = await run(`SELECT likes FROM ${table} WHERE id = ?`, [id])
        return { liked, likes: Number(updated.likes || 0) }
    })
}

/**
 * 举报评论：同一用户对同一条评论只记一次，重复举报返回 already=true
 * @returns {Promise<{complaint: number, already: boolean, self?: boolean}|null>} null 表示评论不可见
 */
async function report(targetType, commentId, userId, reason, detail) {
    const type = normalizeTargetType(targetType)
    const id = parseCommentId(commentId)
    if (!type || !id) return null

    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        const table = TARGETS[type].table
        // 举报只允许命中公开可见的评论，避免通过 ID 探测隐藏内容
        const rows = await run(`${TARGETS[type].visibleSql} FOR UPDATE`, [id])
        if (rows.length === 0) return null
        if (Number(rows[0].user_id) === Number(userId)) {
            const [current] = await run(`SELECT complaint FROM ${table} WHERE id = ?`, [id])
            return { complaint: Number(current?.complaint || 0), already: false, self: true }
        }

        let already = false
        try {
            await run(
                `INSERT INTO comment_report
                 (target_type, comment_id, user_id, reason, detail)
                 VALUES (?, ?, ?, ?, ?)`,
                [type, id, userId, reason, detail]
            )
            await run(`UPDATE ${table} SET complaint = complaint + 1 WHERE id = ?`, [id])
        } catch (err) {
            // 唯一键冲突说明同一用户重复举报，不再重复计数
            if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
                already = true
            } else {
                throw err
            }
        }

        const [updated] = await run(`SELECT complaint FROM ${table} WHERE id = ?`, [id])
        return { complaint: Number(updated.complaint || 0), already }
    })
}

/**
 * 删除评论（逻辑删除，仅本人或管理员可操作）。
 * 与点赞/举报一致，用 targetType 区分文章评论与随笔评论表。
 * @param {'article'|'diary'} targetType
 * @param {number} commentId
 * @param {number} userId
 * @param {string} userType
 * @returns {Promise<number>} 影响行数：1=删除成功，0=不存在/已删除/无权限
 */
async function deleteComment(targetType, commentId, userId, userType) {
    const type = normalizeTargetType(targetType)
    const id = parseCommentId(commentId)
    if (!type || !id) return 0

    const table = TARGETS[type].table
    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        // 先锁定目标评论并校验权限，防止并发删除或越权删除他人评论
        const whereClause = userType === 'admin'
            ? 'id = ? AND status = 1'
            : 'id = ? AND user_id = ? AND status = 1'
        const params = userType === 'admin' ? [id] : [id, userId]
        const targets = await run(
            `SELECT id, parent_id FROM ${table} WHERE ${whereClause} FOR UPDATE`,
            params
        )
        if (targets.length === 0) return 0

        // 一级评论连同其下回复一起逻辑删除；删除回复时只命中自身
        const result = Number(targets[0].parent_id) === 0
            ? await run(
                `UPDATE ${table}
                 SET status = 0
                 WHERE status = 1 AND (id = ? OR parent_id = ?)`,
                [id, id]
            )
            : await run(
                `UPDATE ${table} SET status = 0 WHERE id = ? AND status = 1`,
                [id]
            )
        const affected = Number(result?.affectedRows || 0)
        if (affected === 0) return 0

        // 同步回退所属内容的冗余评论计数，按实际删除条数扣减
        if (type === 'diary') {
            await run(
                `UPDATE diary d
                 JOIN ${table} c ON c.diary_id = d.id
                 SET d.comments = GREATEST(d.comments - ?, 0)
                 WHERE c.id = ?`,
                [affected, id]
            )
        } else {
            await run(
                `UPDATE article a
                 JOIN ${table} c ON c.article_id = a.id
                 SET a.comments = GREATEST(a.comments - ?, 0)
                 WHERE c.id = ?`,
                [affected, id]
            )
        }

        // 评论已删除，相关待处理举报一并落到「已处理」，避免后台留下无效待办
        await run(
            `UPDATE comment_report
             SET status = 1, handled_by = ?, handled_at = NOW()
             WHERE target_type = ? AND comment_id = ? AND status = 0`,
            [userId, type, id]
        )
        return affected
    })
}

function parseReportStatus(value) {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isInteger(parsed) && [0, 1, 2].includes(parsed) ? parsed : null
}

/**
 * 处理备注：选填，最多 200 字；空值统一转成 NULL，避免留下空字符串。
 */
function normalizeHandleNote(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, 200)
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 校验 YYYY-MM-DD 日期，并把当天之外的输入直接判为非法，
 * 避免把任意字符串拼进 SQL 的时间比较条件。
 */
function normalizeDateText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!DATE_PATTERN.test(trimmed)) return null
    const date = new Date(`${trimmed}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return null
    // 形如 2026-02-31 会被 Date 进位到下个月，这里按字符串回读再比对一次
    return date.toISOString().slice(0, 10) === trimmed ? trimmed : null
}

/**
 * 日期范围转 SQL 条件。结束日期按「次日零点」比较，
 * 避免 MySQL 连接时区与本地时区不一致时把当天末尾的举报漏掉。
 * @returns {null|{column: string, from: string, to: string}}
 */
function buildReportDateRange(startDate, endDate) {
    const from = normalizeDateText(startDate)
    const to = normalizeDateText(endDate)
    if (!from && !to) return null
    if (!from || !to) return null
    // 起止顺序写反时不报错，直接按 min/max 归一，避免返回一个必然为空的结果
    const [begin, finish] = from <= to ? [from, to] : [to, from]
    const next = new Date(`${finish}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    return { column: 'r.created_at', from: begin, to: next.toISOString().slice(0, 10) }
}

/**
 * 后台举报处理列表：举报明细逐条分页，附带被举报评论与来源内容信息。
 * 过滤条件只作用于目标类型/原因/处理状态/关键词；
 * 统计卡忽略原因与状态，保证四个状态卡和六个原因数量始终可读。
 */
async function listReports({
    page = 1,
    pageSize = 10,
    offset = 0,
    reason = null,
    targetType = null,
    status = null,
    keyword = '',
    startDate = null,
    endDate = null
} = {}) {
    const baseJoin = `
        FROM comment_report r
        LEFT JOIN users ru ON ru.id = r.user_id
        LEFT JOIN comment c ON r.target_type = 'article' AND c.id = r.comment_id
        LEFT JOIN diary_comment dc ON r.target_type = 'diary' AND dc.id = r.comment_id
        LEFT JOIN users cu ON cu.id = COALESCE(c.user_id, dc.user_id)
        LEFT JOIN article a ON a.id = c.article_id
        LEFT JOIN diary d ON d.id = dc.diary_id
    `

    // 统计卡只跟随来源与关键词，原因/状态由列表条件单独控制，
    // 否则切到某个原因后其它原因的数量会全部归零，筛选体验很怪。
    const summaryWhere = []
    const summaryParams = []
    // 前端来源筛选分三类：博客文章 / 摄影图库 / 随笔。
    // 图库内容在 article 表里 classify=image，因此 article 与 gallery 共用 target_type='article'。
    const sourceFilter = ['article', 'gallery', 'diary'].includes(targetType) ? targetType : null
    if (sourceFilter === 'article') {
        summaryWhere.push("r.target_type = 'article'", "(a.classify IS NULL OR a.classify <> 'image')")
    } else if (sourceFilter === 'gallery') {
        summaryWhere.push("r.target_type = 'article'", "a.classify = 'image'")
    } else if (sourceFilter === 'diary') {
        summaryWhere.push("r.target_type = 'diary'")
    }
    const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : ''
    if (trimmedKeyword) {
        const like = `%${trimmedKeyword}%`
        summaryWhere.push(`(
            COALESCE(c.content, dc.content, '') LIKE ?
            OR COALESCE(a.title, d.title, '') LIKE ?
            OR COALESCE(cu.username, '') LIKE ?
            OR COALESCE(ru.username, '') LIKE ?
        )`)
        summaryParams.push(like, like, like, like)
    }

    // 时间范围跟随统计与列表：运营按“最近新增的举报”处理时，
    // 状态卡也应当同步到同一时间窗，否则数字和列表对不上。
    const dateRange = buildReportDateRange(startDate, endDate)
    if (dateRange) {
        summaryWhere.push(`${dateRange.column} >= ?`, `${dateRange.column} < ?`)
        summaryParams.push(dateRange.from, dateRange.to)
    }

    // 列表条件 = 统计基础条件 + 举报原因 + 处理状态
    const listWhere = [...summaryWhere]
    const listParams = [...summaryParams]
    if (reason) {
        listWhere.push('r.reason = ?')
        listParams.push(reason)
    }
    const reportStatus = parseReportStatus(status)
    if (reportStatus !== null) {
        listWhere.push('r.status = ?')
        listParams.push(reportStatus)
    }
    const whereSql = listWhere.length > 0 ? `WHERE ${listWhere.join(' AND ')}` : ''

    const listSql = `
        SELECT
            r.id, r.target_type, r.comment_id, r.reason, r.detail, r.status,
            r.created_at, r.handled_at,
            r.handle_note,
            r.user_id AS reporter_id,
            ru.username AS reporter_name,
            COALESCE(c.user_id, dc.user_id) AS comment_user_id,
            cu.username AS comment_user_name,
            cu.imgurl AS comment_user_avatar,
            COALESCE(c.content, dc.content) AS comment_content,
            COALESCE(c.status, dc.status) AS comment_status,
            COALESCE(c.likes, dc.likes, 0) AS comment_likes,
            COALESCE(c.complaint, dc.complaint, 0) AS comment_complaint,
            COALESCE(c.created_at, dc.created_at) AS comment_created_at,
            c.article_id AS article_id,
            a.title AS article_title,
            a.classify AS article_classify,
            dc.diary_id AS diary_id,
            d.title AS diary_title,
            hu.username AS handler_name
        ${baseJoin}
        LEFT JOIN users hu ON hu.id = r.handled_by
        ${whereSql}
        ORDER BY CASE r.status WHEN 0 THEN 0 ELSE 1 END, r.created_at DESC
        LIMIT ? OFFSET ?
    `
    const rows = await query(listSql, [...listParams, pageSize, offset])

    const totalSql = `SELECT COUNT(*) AS total ${baseJoin} ${whereSql}`
    const [totalResult] = await query(totalSql, listParams)

    // 状态与原因统计忽略状态/原因过滤，让四个状态卡与六个原因数量始终可用
    const summaryWhereSql = summaryWhere.length > 0 ? `WHERE ${summaryWhere.join(' AND ')}` : ''
    const summaryRows = await query(
        `SELECT r.status, r.reason, COUNT(*) AS total ${baseJoin} ${summaryWhereSql}
         GROUP BY r.status, r.reason`,
        summaryParams
    )
    const summary = { total: 0, pending: 0, resolved: 0, dismissed: 0, reasons: {} }
    for (const row of summaryRows) {
        const count = Number(row.total || 0)
        summary.total += count
        const reportStatusValue = Number(row.status)
        const reasonKey = String(row.reason || 'other')
        if (reportStatusValue === 0) summary.pending += count
        if (reportStatusValue === 1) summary.resolved += count
        if (reportStatusValue === 2) summary.dismissed += count
        summary.reasons[reasonKey] = Number(summary.reasons[reasonKey] || 0) + count
    }

    const list = rows.map(item => {
        const isArticle = item.target_type === 'article'
        return {
            id: Number(item.id),
            targetType: item.target_type,
            commentId: Number(item.comment_id),
            reason: item.reason,
            detail: item.detail || '',
            status: Number(item.status || 0),
            createdAt: item.created_at,
            handledAt: item.handled_at,
            handleNote: item.handle_note || '',
            handlerName: item.handler_name || null,
            reporter: {
                id: Number(item.reporter_id),
                name: item.reporter_name || '已注销用户'
            },
            comment: {
                id: Number(item.comment_id),
                content: item.comment_content || '（评论已删除或不存在）',
                status: item.comment_status === null ? null : Number(item.comment_status),
                likes: Number(item.comment_likes || 0),
                complaint: Number(item.comment_complaint || 0),
                createdAt: item.comment_created_at,
                user: {
                    id: item.comment_user_id === null ? null : Number(item.comment_user_id),
                    name: item.comment_user_name || '已注销用户',
                    avatar: item.comment_user_avatar || null
                }
            },
            source: isArticle
                ? {
                    type: 'article',
                    id: item.article_id === null ? null : Number(item.article_id),
                    title: item.article_title || '文章已删除',
                    classify: item.article_classify || 'article'
                }
                : {
                    type: 'diary',
                    id: item.diary_id === null ? null : Number(item.diary_id),
                    title: item.diary_title || '随笔已删除',
                    classify: 'diary'
                }
        }
    })

    const total = Number(totalResult?.total || 0)
    return {
        list,
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize),
        summary,
        trend: await listReportTrend({ targetType, keyword, startDate, endDate })
    }
}

/**
 * 举报趋势：按天统计最近 N 天的新增举报与已处理量。
 * 复用 listReports 的基础过滤（来源 + 关键词 + 时间范围），
 * 忽略状态筛选，让趋势始终反映整体水位而不是某个状态。
 * @returns {Promise<Array<{date: string, total: number, pending: number, resolved: number, dismissed: number}>>}
 */
async function listReportTrend({
    targetType = null,
    keyword = '',
    startDate = null,
    endDate = null,
    days = 14
} = {}) {
    const totalDays = Number(days)
    const safeDays = Number.isInteger(totalDays) && totalDays > 0 && totalDays <= 60
        ? totalDays
        : 14

    // 日期轴在 Node 侧生成，避免依赖 MySQL 递归 CTE 或日历表
    const today = new Date()
    const buckets = new Map()
    for (let index = safeDays - 1; index >= 0; index -= 1) {
        const day = new Date(today.getTime())
        day.setUTCDate(day.getUTCDate() - index)
        const key = day.toISOString().slice(0, 10)
        buckets.set(key, { date: key, total: 0, pending: 0, resolved: 0, dismissed: 0 })
    }

    const axis = [...buckets.keys()]
    // 起始日期在 Node 侧算好作为普通参数传入，避免不同 MySQL 版本对
    // INTERVAL 占位符（INTERVAL ? DAY）的预处理兼容性不一致。
    const where = ["r.created_at >= ?"]
    const params = [axis[0]]

    const sourceFilter = ['article', 'gallery', 'diary'].includes(targetType) ? targetType : null
    if (sourceFilter === 'article') {
        where.push("r.target_type = 'article'", "(a.classify IS NULL OR a.classify <> 'image')")
    } else if (sourceFilter === 'gallery') {
        where.push("r.target_type = 'article'", "a.classify = 'image'")
    } else if (sourceFilter === 'diary') {
        where.push("r.target_type = 'diary'")
    }

    const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : ''
    if (trimmedKeyword) {
        const like = `%${trimmedKeyword}%`
        where.push(`(
            COALESCE(c.content, dc.content, '') LIKE ?
            OR COALESCE(a.title, d.title, '') LIKE ?
            OR COALESCE(cu.username, '') LIKE ?
            OR COALESCE(ru.username, '') LIKE ?
        )`)
        params.push(like, like, like, like)
    }

    const dateRange = buildReportDateRange(startDate, endDate)
    if (dateRange) {
        where.push(`${dateRange.column} >= ?`, `${dateRange.column} < ?`)
        params.push(dateRange.from, dateRange.to)
    }

    const rows = await query(
        `SELECT DATE(r.created_at) AS day, r.status, COUNT(*) AS total
         FROM comment_report r
         LEFT JOIN comment c ON r.target_type = 'article' AND c.id = r.comment_id
         LEFT JOIN diary_comment dc ON r.target_type = 'diary' AND dc.id = r.comment_id
         LEFT JOIN users cu ON cu.id = COALESCE(c.user_id, dc.user_id)
         LEFT JOIN users ru ON ru.id = r.user_id
         LEFT JOIN article a ON a.id = c.article_id
         LEFT JOIN diary d ON d.id = dc.diary_id
         WHERE ${where.join(' AND ')}
         GROUP BY day, r.status`,
        params
    )

    for (const row of rows) {
        const raw = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day || '')
        const bucket = buckets.get(raw)
        if (!bucket) continue
        const count = Number(row.total || 0)
        const statusValue = Number(row.status)
        bucket.total += count
        if (statusValue === 0) bucket.pending += count
        if (statusValue === 1) bucket.resolved += count
        if (statusValue === 2) bucket.dismissed += count
    }

    return axis.map(key => buckets.get(key))
}

/**
 * 更新单条举报的处理状态。
 * 0（恢复待处理）仅允许从“已处理”回退，并清空原处理信息；
 * 1（已处理）/ 2（已忽略）用于正常处理，可附处理备注。
 * @returns {Promise<boolean>} 是否命中并更新
 */
async function updateReportStatus(reportId, status, handledBy, note = null) {
    const id = parseCommentId(reportId)
    const nextStatus = parseReportStatus(status)
    if (!id || ![0, 1, 2].includes(nextStatus)) return false

    const handleNote = normalizeHandleNote(note)
    if (nextStatus === 0) {
        const resetResult = await query(
            `UPDATE comment_report
             SET status = 0, handled_by = NULL, handled_at = NULL, handle_note = NULL
             WHERE id = ? AND status = 1`,
            [id]
        )
        return Number(resetResult?.affectedRows || 0) > 0
    }

    const result = await query(
        `UPDATE comment_report
         SET status = ?, handled_by = ?, handled_at = NOW(), handle_note = ?
         WHERE id = ?`,
        [nextStatus, handledBy, handleNote, id]
    )
    return Number(result?.affectedRows || 0) > 0
}

function parseReportIds(value) {
    if (!Array.isArray(value)) return []
    const unique = new Set()
    for (const raw of value) {
        const id = parseCommentId(raw)
        if (id) unique.add(id)
        if (unique.size >= 200) break
    }
    return [...unique]
}

/**
 * 批量更新举报状态。
 *
 * 上限 200 条：后台勾选范围受当前页限制，这个上限只为防止异常入参打爆 SQL。
 * 返回真实更新条数，前端据此提示“成功 N 条”，而不是假设全部命中。
 * @returns {Promise<number>} 实际更新条数
 */
async function updateReportStatusBatch(ids, status, handledBy, note = null) {
    const nextStatus = parseReportStatus(status)
    const reportIds = parseReportIds(ids)
    if (!reportIds.length || ![0, 1, 2].includes(nextStatus)) return 0

    const placeholders = reportIds.map(() => '?').join(', ')
    const handleNote = normalizeHandleNote(note)

    // 恢复待处理只处理「已处理」的记录，和单条接口保持同一条状态机
    if (nextStatus === 0) {
        const result = await query(
            `UPDATE comment_report
             SET status = 0, handled_by = NULL, handled_at = NULL, handle_note = NULL
             WHERE id IN (${placeholders}) AND status = 1`,
            reportIds
        )
        return Number(result?.affectedRows || 0)
    }

    const result = await query(
        `UPDATE comment_report
         SET status = ?, handled_by = ?, handled_at = NOW(), handle_note = ?
         WHERE id IN (${placeholders})`,
        [nextStatus, handledBy, handleNote, ...reportIds]
    )
    return Number(result?.affectedRows || 0)
}

module.exports = {
    normalizeTargetType,
    parseCommentId,
    findLikedIds,
    findLikeState,
    toggleLike,
    report,
    deleteComment,
    listReports,
    updateReportStatus,
    updateReportStatusBatch,
    listReportTrend
}
