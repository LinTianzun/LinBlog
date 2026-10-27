const { query, withTransaction } = require('../../db/dbnew')

// 文章评论与随笔评论是两张表，用 targetType 区分；表名与可见性条件都来自白名单
const TARGETS = {
    article: {
        table: 'comment',
        // 文章评论只对已发布文章可见
        visibleSql: `SELECT c.id, c.likes FROM comment c
                     INNER JOIN article a ON c.article_id = a.id
                     WHERE c.id = ? AND c.status = 1 AND a.state = 'published'
                     LIMIT 1`
    },
    diary: {
        table: 'diary_comment',
        // 随笔没有草稿概念，status=1 即可见
        visibleSql: `SELECT c.id, c.likes FROM diary_comment c
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
 * @returns {Promise<{complaint: number, already: boolean}|null>} null 表示评论不可见
 */
async function report(targetType, commentId, userId) {
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

        let already = false
        try {
            await run(
                `INSERT INTO comment_report (target_type, comment_id, user_id) VALUES (?, ?, ?)`,
                [type, id, userId]
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

module.exports = {
    normalizeTargetType,
    parseCommentId,
    findLikedIds,
    findLikeState,
    toggleLike,
    report
}
