const { query, withTransaction } = require('../../db/dbnew')

function parseDiaryId(value) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * 查询随笔的点赞状态与总数（匿名可用）
 * 只统计 status=1 的正常随笔，未登录时 liked 恒为 false。
 * @returns {Promise<{liked: boolean, likes: number}|null>} null 表示随笔不存在或已删除
 */
async function findLikeState(diaryId, userId) {
    const id = parseDiaryId(diaryId)
    if (!id) return null

    const rows = await query(
        `SELECT likes FROM diary WHERE id = ? AND status = 1 LIMIT 1`,
        [id]
    )
    const diary = rows[0]
    if (!diary) return null

    let liked = false
    if (userId) {
        const mine = await query(
            'SELECT id FROM diary_praise WHERE diary_id = ? AND user_id = ? LIMIT 1',
            [id, userId]
        )
        liked = mine.length > 0
    }

    return { liked, likes: Number(diary.likes || 0) }
}

/**
 * 切换随笔点赞（已赞则取消）
 * diary.likes 是展示用冗余计数，与明细必须在同一事务内更新。
 * @returns {Promise<{liked: boolean, likes: number}|null>} null 表示随笔不存在或已删除
 */
async function toggleLike(diaryId, userId) {
    const id = parseDiaryId(diaryId)
    if (!id) return null

    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        // 锁定随笔行，避免并发点赞导致计数漂移
        const diaries = await run(
            `SELECT id FROM diary WHERE id = ? AND status = 1 FOR UPDATE`,
            [id]
        )
        if (diaries.length === 0) return null

        const existing = await run(
            'SELECT id FROM diary_praise WHERE diary_id = ? AND user_id = ? LIMIT 1',
            [id, userId]
        )

        let liked
        if (existing.length > 0) {
            await run('DELETE FROM diary_praise WHERE id = ?', [existing[0].id])
            await run(
                'UPDATE diary SET likes = GREATEST(likes - 1, 0) WHERE id = ?',
                [id]
            )
            liked = false
        } else {
            await run(
                'INSERT INTO diary_praise (user_id, diary_id) VALUES (?, ?)',
                [userId, id]
            )
            await run('UPDATE diary SET likes = likes + 1 WHERE id = ?', [id])
            liked = true
        }

        const [updated] = await run('SELECT likes FROM diary WHERE id = ?', [id])
        return { liked, likes: Number(updated.likes || 0) }
    })
}

/**
 * 随笔评论列表（仅正常状态随笔下的未删除评论）
 */
async function getCommentsByDiary(diaryId, page, pageSize, offset) {
    const id = parseDiaryId(diaryId)
    if (!id) return { total: 0, page, pageSize, totalPage: 0, list: [] }

    const list = await query(
        `SELECT c.id, c.user_id, u.username AS user_name, u.imgurl AS user_avatar,
                c.content, c.created_at
         FROM diary_comment c
         INNER JOIN diary d ON c.diary_id = d.id
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.diary_id = ? AND c.status = 1 AND d.status = 1
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
        [id, pageSize, offset]
    )

    const totalRows = await query(
        `SELECT COUNT(*) AS total
         FROM diary_comment c
         INNER JOIN diary d ON c.diary_id = d.id
         WHERE c.diary_id = ? AND c.status = 1 AND d.status = 1`,
        [id]
    )

    const total = Number(totalRows[0]?.total || 0)
    return {
        list: list.map(item => ({
            id: item.id,
            userId: item.user_id,
            userName: item.user_name,
            userAvatar: item.user_avatar,
            content: item.content,
            createdAt: item.created_at
        })),
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    }
}

/**
 * 新增随笔评论并同步 diary.comments 冗余计数
 * @returns {Promise<{commentId: number}|null>} null 表示随笔不存在或已删除
 */
async function createComment({ diaryId, userId, content }) {
    const id = parseDiaryId(diaryId)
    if (!id) return null

    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        // 只允许评论正常状态的随笔；随笔没有草稿概念，status=1 即可评论
        const diaries = await run(
            `SELECT id FROM diary WHERE id = ? AND status = 1 FOR UPDATE`,
            [id]
        )
        if (diaries.length === 0) return null

        const result = await run(
            `INSERT INTO diary_comment (user_id, diary_id, content) VALUES (?, ?, ?)`,
            [userId, id, content]
        )
        await run('UPDATE diary SET comments = comments + 1 WHERE id = ?', [id])

        return { commentId: result.insertId }
    })
}

module.exports = {
    parseDiaryId,
    findLikeState,
    toggleLike,
    getCommentsByDiary,
    createComment
}
