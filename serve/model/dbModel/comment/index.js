const { query } = require('../../db/dbnew')

/**
 * 查询所有评论（按时间降序，分页）
 * @param {number} page - 页码（默认1）
 * @param {number} limit - 每页条数（默认10）
 * @returns {Promise<Object>} 评论列表 + 总条数
 */
async function getAllComments(page = 1, limit = 10) {
    //  计算偏移量
    const offset = (page - 1) * limit

    //  查询当前页评论(按时间降序 最新评论)
    const listSql = `
    SELECT id, user_id, user_type, user_name, article_id, content, moment, complaint, isread
    FROM comment
    ORDER BY moment DESC
    LIMIT ? OFFSET ?
`
    const list = await query(listSql, [limit, offset])

    //  查询所有评论总条数
    const countSql = 'SELECT COUNT(*) AS total FROM comment'
    const [countResult] = await query(countSql)

    return {
        list,
        total: countResult.total,
        page,
        limit,
        totalPages: Math.ceil(countResult.total / limit)
    }
}

/**
 * 1. 创建评论
 * @param {Object} commentInfo - 评论信息
 * @returns {Promise<Object>} 新增评论的ID
 */
async function createComment(commentInfo) {
    const { user_id, user_type, user_name, article_id, content } = commentInfo
    const sql = `
    INSERT INTO comment (user_id, user_type, user_name, article_id, content)
    VALUES (?, ?, ?, ?, ?)
`
    const result = await query(sql, [user_id, user_type, user_name, article_id, content])
    return { commentId: result.insertId } // 返回新增评论ID
}

module.exports = {
    getAllComments,
    createComment
}