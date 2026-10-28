const { query, withTransaction } = require('../../db/dbnew')
const commentInteractionModel = require('../commentInteraction/index')

/**
 * 分页查询评论（关联用户+文章表，仅查正常状态）
 * @param {number} page - 页码（默认1）
 * @param {number} pageSize - 每页条数（默认10）
 * @param {number} offset - 偏移量
 * @param {number|null} articleId - 只看某篇文章下的评论（可选）
 * @returns {Promise<Object>} 分页评论数据（含文章信息）
 */
async function getCommentsByPage(page, pageSize, offset, articleId = null, userId = null) {

    // 后台文章详情需要按文章过滤；总览卡片不传则看全站
    const where = ['c.status = 1']
    const whereParams = []
    if (Number.isSafeInteger(articleId) && articleId > 0) {
        where.push('c.article_id = ?')
        whereParams.push(articleId)
    }
    const whereSql = where.join(' AND ')

    // 关联users表（查用户名）和article表（查文章标题），只查状态正常的评论
    const listSql = `
        SELECT 
            c.id,
            c.user_id,
            u.username AS user_name,  
            u.imgurl AS user_avatar,
            c.article_id,
            a.title AS article_title, 
            a.classify AS article_classify,
            c.parent_id,
            c.reply_to_comment_id,
            c.reply_to_user_id,
            ru.username AS reply_to_user_name,
            c.content,
            c.likes,
            c.complaint,
            c.is_read,
            c.created_at
        FROM comment c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN users ru ON c.reply_to_user_id = ru.id
        LEFT JOIN article a ON c.article_id = a.id
        WHERE ${whereSql}  -- 仅查询正常状态（未删除）的评论
        ORDER BY c.created_at DESC  -- 按评论时间倒序（最新在前）
        LIMIT ? OFFSET ?
    `

    // 查询当前页评论
    const list = await query(listSql, [...whereParams, pageSize, offset])
    // 当前用户点赞过的评论集合，列表里标记 liked
    const likedIds = await commentInteractionModel.findLikedIds(
        'article',
        list.map(item => item.id),
        userId
    )

    // 格式化返回结果：封装article对象
    const formattedList = list.map(item => ({
        id: item.id,
        userId: item.user_id,
        userName: item.user_name,
        userAvatar: item.user_avatar,
        article: {
            id: item.article_id,
            title: item.article_title || '文章已删除',  // 文章删除时的兼容处理
            // 图库也是 article 表里的行（classify=image），总览点评论跳转时要区分入口
            classify: item.article_classify || null
        },
        parentId: item.parent_id,
        replyToCommentId: item.reply_to_comment_id,
        replyToUserId: item.reply_to_user_id,
        replyToUserName: item.reply_to_user_name,
        content: item.content,
        likes: Number(item.likes || 0),
        liked: likedIds.has(Number(item.id)),
        complaint: item.complaint,
        isRead: item.is_read,
        createdAt: item.created_at
    }))

    // 查询总条数（用于分页计算）
    const totalSql = `SELECT COUNT(*) AS total FROM comment c WHERE ${whereSql}`
    const [totalResult] = await query(totalSql, whereParams)

    return {
        list: formattedList,
        total: totalResult.total,
        page,
        pageSize,
        totalPage: Math.ceil(totalResult.total / pageSize)
    }
}

/**
 * 公开文章详情页的评论列表：仅已发布文章下的正常评论
 * @param {number} articleId - 文章 ID（必须已发布）
 */
async function getPublicCommentsByArticle(articleId, page, pageSize, offset, userId = null) {
    const baseWhere = `
        c.status = 1
        AND a.state = 'published'
        AND a.id IS NOT NULL
        AND c.article_id = ?
    `

    const listSql = `
        SELECT
            c.id,
            c.user_id,
            u.username AS user_name,
            u.imgurl AS user_avatar,
            c.parent_id,
            c.reply_to_comment_id,
            c.reply_to_user_id,
            ru.username AS reply_to_user_name,
            c.content,
            c.likes,
            c.complaint,
            c.created_at
        FROM comment c
        INNER JOIN article a ON c.article_id = a.id
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN users ru ON c.reply_to_user_id = ru.id
        WHERE ${baseWhere}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `
    const list = await query(listSql, [articleId, pageSize, offset])

    const totalSql = `
        SELECT COUNT(*) AS total
        FROM comment c
        INNER JOIN article a ON c.article_id = a.id
        WHERE ${baseWhere}
    `
    const [totalResult] = await query(totalSql, [articleId])

    const likedIds = await commentInteractionModel.findLikedIds(
        'article',
        list.map(item => item.id),
        userId
    )

    return {
        list: list.map(item => ({
            id: item.id,
            userId: item.user_id,
            userName: item.user_name,
            userAvatar: item.user_avatar,
            parentId: item.parent_id,
            replyToCommentId: item.reply_to_comment_id,
            replyToUserId: item.reply_to_user_id,
            replyToUserName: item.reply_to_user_name,
            content: item.content,
            likes: Number(item.likes || 0),
            liked: likedIds.has(Number(item.id)),
            complaint: Number(item.complaint || 0),
            createdAt: item.created_at
        })),
        total: totalResult.total,
        page,
        pageSize,
        totalPage: Math.ceil(totalResult.total / pageSize)
    }
}

/**
 * 新增评论（支持一级评论/二级回复）
 * @param {Object} commentInfo - 评论信息
 * @returns {Promise<Object>} 新增评论ID
 */
async function createComment(commentInfo) {
    const {
        userId,
        articleId,
        content,
        parentId = 0,
        replyToCommentId = null,
        replyToUserId = null
    } = commentInfo
    const sql = `
        INSERT INTO comment
            (user_id, article_id, parent_id, reply_to_comment_id, reply_to_user_id, content)
        VALUES (?, ?, ?, ?, ?, ?)
    `
    const result = await query(sql, [
        userId,
        articleId,
        parentId,
        replyToCommentId,
        replyToUserId,
        content
    ])
    // 文章上的 comments 是展示用冗余计数，与评论明细同步递增
    await query('UPDATE article SET comments = comments + 1 WHERE id = ?', [articleId])
    return { commentId: result.insertId }
}

/**
 * 删除评论（逻辑删除，一级评论会连同其下回复一起删除）
 * @param {number} commentId - 评论ID
 * @param {number} userId - 操作人ID（用于权限校验）
 * @param {string} userType - 操作人类型（admin/normal等，用于权限校验）
 * @returns {Promise<number>} 实际删除条数（0=无权限/评论不存在）
 */
async function deleteComment(commentId, userId, userType) {
    return withTransaction(async (connection) => {
        const run = (sql, values = []) => new Promise((resolve, reject) => {
            connection.query(sql, values, (err, results) => {
                if (err) reject(err)
                else resolve(results)
            })
        })

        // 先锁定并校验目标评论，避免并发删除或越权删除回复
        const whereClause = userType === 'admin'
            ? 'id = ? AND status = 1'
            : 'id = ? AND user_id = ? AND status = 1'
        const params = userType === 'admin' ? [commentId] : [commentId, userId]
        const targets = await run(
            `SELECT id, article_id, parent_id FROM comment WHERE ${whereClause} FOR UPDATE`,
            params
        )
        if (targets.length === 0) return 0

        const target = targets[0]
        // 一级评论连同其下回复一起逻辑删除；删除回复时只命中自身
        const result = Number(target.parent_id) === 0
            ? await run(
                `UPDATE comment
                 SET status = 0
                 WHERE status = 1 AND (id = ? OR parent_id = ?)`,
                [commentId, commentId]
            )
            : await run(
                'UPDATE comment SET status = 0 WHERE id = ? AND status = 1',
                [commentId]
            )
        const affected = Number(result?.affectedRows || 0)
        if (affected === 0) return 0

        // 按实际删除条数回退文章评论计数，避免一级评论连带回复时少减
        await run(
            `UPDATE article
             SET comments = GREATEST(comments - ?, 0)
             WHERE id = ?`,
            [affected, target.article_id]
        )
        return affected
    })
}

/**
 * 分页查询当前用户发出的所有评论（关联文章信息）
 * @param {number} userId - 当前登录用户ID
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 * @param {number} offset - 偏移量
 * @returns {Promise<Object>} 分页评论数据（格式与全局评论查询一致）
 */
async function findMyCommentsByPage(userId, page, pageSize, offset) {
    // 关联文章表，仅查询当前用户、正常状态的评论，按时间倒序
    const listSql = `
        SELECT 
            c.id,
            c.user_id,
            u.username AS user_name,
            u.imgurl AS user_avatar,
            c.article_id,
            a.title AS article_title,
            a.classify AS article_classify,
            c.parent_id,
            c.reply_to_comment_id,
            c.reply_to_user_id,
            ru.username AS reply_to_user_name,
            c.content,
            c.complaint,
            c.is_read,
            c.created_at
        FROM comment c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN users ru ON c.reply_to_user_id = ru.id
        LEFT JOIN article a ON c.article_id = a.id
        WHERE 
            c.user_id = ?
            AND c.status = 1
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `

    //  查询当前页评论列表
    const list = await query(listSql, [userId, pageSize, offset])

    //  格式化列表
    const formattedList = list.map(item => ({
        id: item.id,
        userId: item.user_id,
        userName: item.user_name,
        userAvatar: item.user_avatar,
        article: {
            id: item.article_id,
            title: item.article_title || '文章已删除',
            classify: item.article_classify || null
        },
        parentId: item.parent_id,
        replyToCommentId: item.reply_to_comment_id,
        replyToUserId: item.reply_to_user_id,
        replyToUserName: item.reply_to_user_name,
        content: item.content,
        complaint: item.complaint,
        isRead: item.is_read,
        createdAt: item.created_at
    }))

    // 查询当前用户的评论总条数（用于分页计算）
    const totalSql = `
        SELECT COUNT(*) AS total 
        FROM comment 
        WHERE user_id = ? AND status = 1
    `
    const [totalResult] = await query(totalSql, [userId])
    const total = totalResult.total

    return {
        list: formattedList,
        total,
        page,
        pageSize,
        totalPage: Math.ceil(total / pageSize)
    }
}

module.exports = {
    getCommentsByPage,
    getPublicCommentsByArticle,
    createComment,
    deleteComment,
    findMyCommentsByPage
}
