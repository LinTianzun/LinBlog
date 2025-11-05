const { query } = require('../../db/dbnew')

/**
 * 分页查询评论（关联用户+文章表，仅查正常状态）
 * @param {number} page - 页码（默认1）
 * @param {number} pageSize - 每页条数（默认10）
 * @returns {Promise<Object>} 分页评论数据（含文章信息）
 */
async function getCommentsByPage(page, pageSize, offset) {

    // 关联users表（查用户名）和article表（查文章标题），只查状态正常的评论
    const listSql = `
        SELECT 
            c.id,
            c.user_id,
            u.username AS user_name,  
            c.article_id,
            a.title AS article_title, 
            c.parent_id,              
            c.content,
            c.complaint,
            c.is_read,
            c.created_at
        FROM comment c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN article a ON c.article_id = a.id
        WHERE c.status = 1  -- 仅查询正常状态（未删除）的评论
        ORDER BY c.created_at DESC  -- 按评论时间倒序（最新在前）
        LIMIT ? OFFSET ?
    `

    // 查询当前页评论
    const list = await query(listSql, [pageSize, offset])
    // 格式化返回结果：封装article对象
    const formattedList = list.map(item => ({
        id: item.id,
        userId: item.user_id,
        userName: item.user_name,
        article: {
            id: item.article_id,
            title: item.article_title || '文章已删除'  // 文章删除时的兼容处理
        },
        parentId: item.parent_id,
        content: item.content,
        complaint: item.complaint,
        isRead: item.is_read,
        createdAt: item.created_at
    }))

    // 查询总条数（用于分页计算）
    const totalSql = 'SELECT COUNT(*) AS total FROM comment WHERE status = 1'
    const [totalResult] = await query(totalSql)

    return {
        list: formattedList,
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
    const { userId, articleId, content, parentId = 0 } = commentInfo
    const sql = `
        INSERT INTO comment (user_id, article_id, parent_id, content)
        VALUES (?, ?, ?, ?)
    `
    const result = await query(sql, [userId, articleId, parentId, content])
    return { commentId: result.insertId }
}

/**
 * 删除评论（物理删除→逻辑删除，更新status为0）
 * @param {number} commentId - 评论ID
 * @param {number} userId - 操作人ID（用于权限校验）
 * @param {string} userType - 操作人类型（admin/normal等，用于权限校验）
 * @returns {Promise<number>} 影响的行数（0=无权限/评论不存在，1=删除成功）
 */
async function deleteComment(commentId, userId, userType) {
    // 管理员可删除任意评论，普通用户只能删除自己的评论
    const whereClause = userType === 'admin'
        ? 'id = ? AND status = 1'
        : 'id = ? AND user_id = ? AND status = 1'

    const sql = `
        UPDATE comment 
        SET status = 0
        WHERE ${whereClause}
    `   //   逻辑删除（0=已删除）

    const params = userType === 'admin'
        ? [commentId]
        : [commentId, userId]

    const result = await query(sql, params)
    return result.affectedRows // 影响行数：1=成功，0=失败
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
            c.article_id,
            a.title AS article_title,
            c.parent_id,
            c.content,
            c.complaint,
            c.is_read,
            c.created_at
        FROM comment c
        LEFT JOIN users u ON c.user_id = u.id
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
        article: {
            id: item.article_id,
            title: item.article_title || '文章已删除'
        },
        parentId: item.parent_id,
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
    createComment,
    deleteComment,
    findMyCommentsByPage
}