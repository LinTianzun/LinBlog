const { query, withTransaction } = require('../../db/dbnew')

/**
 * 点赞状态与计数
 * praise 表记录「谁赞了哪篇」，article.likes 是展示用的冗余计数。
 * 两者必须在同一事务内更新，否则并发下计数会与明细脱节。
 * @param {number} articleId - 文章ID
 * @param {number|null} userId - 当前用户ID；游客传 null
 * @returns {Promise<{liked: boolean, likes: number}>}
 */
async function findLikeState(articleId, userId) {
    const rows = await query(
        `SELECT a.likes, a.state FROM article a WHERE a.id = ? LIMIT 1`,
        [articleId]
    )
    const article = rows[0]
    if (!article) return null

    let liked = false
    if (userId) {
        const mine = await query(
            'SELECT id FROM praise WHERE article_id = ? AND user_id = ? LIMIT 1',
            [articleId, userId]
        )
        liked = mine.length > 0
    }

    return {
        liked,
        likes: Number(article.likes || 0),
        state: article.state
    }
}

/**
 * 切换点赞状态（已赞则取消，未赞则点赞）
 * @param {number} articleId
 * @param {number} userId
 * @returns {Promise<{liked: boolean, likes: number}|null>} null 表示文章不存在或不可见
 */
async function toggleLike(articleId, userId) {
    return withTransaction(async (connection) => {
        // withTransaction 回调拿到的是裸连接，这里包一层 Promise 化查询
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        // 锁定文章行：同一篇文章的点赞/取消按顺序执行，避免计数漂移
        const articles = await run(
            `SELECT id, state FROM article WHERE id = ? AND state = 'published' FOR UPDATE`,
            [articleId]
        )
        if (articles.length === 0) return null

        const existing = await run(
            'SELECT id FROM praise WHERE article_id = ? AND user_id = ? LIMIT 1',
            [articleId, userId]
        )

        let liked
        if (existing.length > 0) {
            await run('DELETE FROM praise WHERE id = ?', [existing[0].id])
            await run(
                'UPDATE article SET likes = GREATEST(likes - 1, 0) WHERE id = ?',
                [articleId]
            )
            liked = false
        } else {
            await run(
                'INSERT INTO praise (user_id, article_id) VALUES (?, ?)',
                [userId, articleId]
            )
            await run('UPDATE article SET likes = likes + 1 WHERE id = ?', [articleId])
            liked = true
        }

        const [updated] = await run('SELECT likes FROM article WHERE id = ?', [articleId])
        return { liked, likes: Number(updated.likes || 0) }
    })
}

module.exports = {
    findLikeState,
    toggleLike
}
