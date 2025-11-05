const commentModel = require('../model/dbModel/comment/index')
const articleModel = require('../model/dbModel/article/index') // 用于校验文章是否存在
const { formatPaginationParams } = require('../utils/paginationUtil')   // 引入封装的分页工具
const { query } = require('../model/db/dbnew')
/**
 * 分页查询评论（支持一级/二级评论，关联文章信息）
 */
async function getComments(req, res) {
    try {
        // 调用分页工具校验参数（使用默认配置：page=1，pageSize=10，max=50）
        const paginationResult = formatPaginationParams(req.query)

        // 参数校验失败，直接返回错误
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }

        // 校验通过，获取参数
        const { page, pageSize, offset } = paginationResult.data

        // 调用模型分页查询（关联文章+用户信息）
        const result = await commentModel.getCommentsByPage(page, pageSize, offset)
        res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: result.total,       // 总评论数（仅正常状态）
                page: result.page,         // 当前页码
                pageSize: result.pageSize, // 每页条数
                totalPage: result.totalPage, // 总页数
                list: result.list          // 评论列表（含article对象）
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询评论失败：' + err.message })
    }
}

/**
 * 新增评论（支持一级评论/二级回复）
 */
async function createComment(req, res) {
    try {
        const { articleId, content, parentId = 0 } = req.body
        const { userId, userType } = req.user // 从Token获取当前用户ID和类型

        // 1. 必传参数校验
        if (!articleId || !content) {
            return res.status(400).json({ code: 400, message: '文章ID和评论内容不能为空' })
        }
        // 2. 评论内容长度校验（不超过512字）
        if (content.length > 512) {
            return res.status(400).json({ code: 400, message: '评论内容不能超过512字' })
        }
        // 3. 校验文章是否存在（可选，提升体验）
        const [article] = await articleModel.findAtricleById(articleId)
        if (!article || article.state === 'deleted') {
            return res.status(404).json({ code: 404, message: '关联文章不存在或已删除' })
        }
        // 4. 校验父评论是否存在（如果是二级回复）
        if (parentId > 0) {
            const [parentComment] = await query('SELECT id FROM comment WHERE id = ? AND status = 1', [parentId])
            if (!parentComment) {
                return res.status(404).json({ code: 404, message: '回复的评论不存在或已删除' })
            }
        }

        // 调用模型新增评论
        const result = await commentModel.createComment({
            userId,
            articleId,
            content,
            parentId
        })

        res.status(201).json({
            code: 200,
            message: '评论成功',
            data: {
                commentId: result.commentId, // 新增评论ID
                createdAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '评论失败：' + err.message })
    }
}

/**
 * 删除评论（逻辑删除，仅本人或管理员可操作）
 */
async function deleteComment(req, res) {
    try {
        const { id: commentId } = req.params // 从URL获取评论ID
        const { userId, userType } = req.user // 从Token获取当前用户信息

        // 1. 校验评论ID是否有效
        if (!commentId || isNaN(commentId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的评论ID' })
        }

        // 2. 调用模型删除评论（权限校验在模型层）
        const affectedRows = await commentModel.deleteComment(commentId, userId, userType)
        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限删除该评论（评论不存在/已删除/非本人评论）' })
        }

        res.json({ code: 200, message: '评论删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '删除评论失败：' + err.message })
    }
}

/**
 * 分页查询当前用户发出的所有评论
 */
async function getMyComments(req, res) {
    try {
        const { userId } = req.user   // 从Token获取当前登录用户ID（无需前端传参）

        //  调用分页工具校验参数（默认page=1，pageSize=10，最大50条/页）
        const paginationResult = formatPaginationParams(req.query, {})

        //  如果参数校验失败 则返回错误
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }

        //  校验通过 获取分页参数
        const { page, pageSize, offset } = paginationResult.data

        //  调用模型查询当前用户的所有评论(分页)
        const result = await commentModel.findMyCommentsByPage(userId, page, pageSize, offset)

        //  返回结果（格式与全局评论查询完全一致）
        res.json({
            code: 200,
            message: result.total > 0 ? '查询成功' : '当前用户暂无评论',
            data: {
                total: result.total,       // 该用户的总评论数（仅正常状态）
                page: result.page,         // 当前页码
                pageSize: result.pageSize, // 每页条数
                totalPage: result.totalPage, // 总页数
                list: result.list          // 评论列表（含article对象）
            }
        })

    } catch (err) {
        res.status(500).json({ code: 500, message: '查询个人评论失败：' + err.message })
    }
}

module.exports = {
    getComments,
    createComment,
    deleteComment,
    getMyComments
}