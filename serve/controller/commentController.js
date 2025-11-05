const commentModel = require('../model/dbModel/comment/index')

/**
 * 查询所有评论 按最新时间显示
 */
async function getAllComments(req, res) {
    try {
        //  分页参数 默认 page=1 limit=10
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10

        //  查询所有评论
        const result = await commentModel.getAllComments(page, limit)

        res.json({
            code: 200,
            message: '查询成功',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询失败：' + err.message })
    }
}

/**
 * 创建评论
 */
async function createComment(req, res) {
    try {
        const { article_id, content } = req.body
        
    } catch (err) {
        res.status(500).json({ code: 500, message: '评论失败' + err.message })
    }
}

module.exports = {
    getAllComments,
    createComment
}