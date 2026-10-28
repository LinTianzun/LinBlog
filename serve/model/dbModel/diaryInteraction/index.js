const { query, withTransaction } = require('../../db/dbnew')
const commentInteractionModel = require('../commentInteraction/index')

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
async function getCommentsByDiary(diaryId, page, pageSize, offset, userId = null) {
    const id = parseDiaryId(diaryId)
    if (!id) return { total: 0, page, pageSize, totalPage: 0, list: [] }

    const list = await query(
        `SELECT c.id, c.user_id, u.username AS user_name, u.imgurl AS user_avatar,
                c.parent_id, c.reply_to_comment_id, c.reply_to_user_id,
                ru.username AS reply_to_user_name,
                c.content, c.likes, c.complaint, c.created_at
         FROM diary_comment c
         INNER JOIN diary d ON c.diary_id = d.id
         LEFT JOIN users u ON c.user_id = u.id
         LEFT JOIN users ru ON c.reply_to_user_id = ru.id
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

    const likedIds = await commentInteractionModel.findLikedIds(
        'diary',
        list.map(item => item.id),
        userId
    )

    return {
        list: list.map(item => ({
            id: item.id,
            userId: item.user_id,
            userName: item.user_name,
            userAvatar: item.user_avatar,
            parentId: Number(item.parent_id || 0),
            replyToCommentId: item.reply_to_comment_id === null ? null : Number(item.reply_to_comment_id),
            replyToUserId: item.reply_to_user_id === null ? null : Number(item.reply_to_user_id),
            replyToUserName: item.reply_to_user_name,
            content: item.content,
            likes: Number(item.likes || 0),
            liked: likedIds.has(Number(item.id)),
            complaint: Number(item.complaint || 0),
            createdAt: item.created_at
        })),
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    }
}

/**
 * 新增随笔评论并同步 diary.comments 冗余计数。
 * 与文章评论一致：回复二级评论时归一挂到根评论下（两级结构），
 * 并记录实际回复目标（replyTo）供前端展示「回复 @某人」。
 * @returns {Promise<{commentId: number}|{invalidParent: boolean}|null>}
 *   null 表示随笔不存在或已删除；invalidParent 表示回复目标不存在
 */
async function createComment({ diaryId, userId, content, parentId = 0 }) {
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

        let rootParentId = 0
        let replyToCommentId = null
        let replyToUserId = null

        const requestedParent = Number(parentId) || 0
        if (requestedParent > 0) {
            const parents = await run(
                `SELECT id, user_id, parent_id FROM diary_comment
                 WHERE id = ? AND diary_id = ? AND status = 1 LIMIT 1`,
                [requestedParent, id]
            )
            const parent = parents[0]
            if (!parent) return { invalidParent: true }

            if (Number(parent.parent_id) > 0) {
                // 回复的是二级评论：根评论用它的 parent，实际回复目标仍是所点的那条
                rootParentId = Number(parent.parent_id)
            } else {
                rootParentId = Number(parent.id)
            }
            replyToCommentId = Number(parent.id)
            replyToUserId = Number(parent.user_id)
        }

        const result = await run(
            `INSERT INTO diary_comment
                (user_id, diary_id, parent_id, reply_to_comment_id, reply_to_user_id, content)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, id, rootParentId, replyToCommentId, replyToUserId, content]
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
