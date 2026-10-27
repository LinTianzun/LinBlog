const commentModel = require('../model/dbModel/comment/index')
const articleModel = require('../model/dbModel/article/index') // 用于校验文章是否存在
const { formatPaginationParams } = require('../utils/paginationUtil')   // 引入封装的分页工具
const { query } = require('../model/db/dbnew')
const { writeSystemLog } = require('../utils/logHelper')
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

        // 可选：只看某篇文章的评论（后台文章详情）
        let articleId = null
        if (req.query.articleId !== undefined && req.query.articleId !== '') {
            const parsed = Number(req.query.articleId)
            if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
            }
            articleId = parsed
        }

        // 调用模型分页查询（关联文章+用户信息）
        const result = await commentModel.getCommentsByPage(page, pageSize, offset, articleId)
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
 * 公开文章评论列表（仅已发布文章的正常评论，不带后台管理字段）
 */
async function getPublicComments(req, res) {
    try {
        const { articleId } = req.query
        const parsedArticleId = Number(articleId)
        if (!Number.isSafeInteger(parsedArticleId) || parsedArticleId <= 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const paginationResult = formatPaginationParams(req.query)
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        const result = await commentModel.getPublicCommentsByArticle(
            parsedArticleId,
            page,
            pageSize,
            offset
        )

        res.json({
            code: 200,
            message: result.total > 0 ? '查询成功' : '暂无评论',
            data: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
                totalPage: result.totalPage,
                list: result.list
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '查询公开评论失败：' + err.message })
    }
}

/**
 * 校验评论入参并写入评论（后台与门户共用）
 * 校验失败时返回 { error: { code, message } }，由调用方负责输出响应。
 */
async function submitComment(body, userId) {
    const { articleId, content, parentId = 0 } = body

    // 严格校验文章 ID、父评论 ID 和评论内容，避免非法值进入数据层。
    const parsedArticleId = Number(articleId)
    const parsedParentId = Number(parentId)
    if (!Number.isSafeInteger(parsedArticleId) || parsedArticleId <= 0) {
        return { error: { code: 400, message: '请传入有效的文章ID' } }
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
        return { error: { code: 400, message: '评论内容不能为空' } }
    }
    if (content.length > 512) {
        return { error: { code: 400, message: '评论内容不能超过512字' } }
    }
    if (!Number.isSafeInteger(parsedParentId) || parsedParentId < 0) {
        return { error: { code: 400, message: '父评论ID必须是非负整数' } }
    }

    // 仅允许对已发布文章发表评论，防止通过接口评论草稿或驳回文章。
    const [article] = await articleModel.findAtricleStateById(parsedArticleId)
    if (!article || article.state === 'deleted') {
        return { error: { code: 404, message: '关联文章不存在或已删除' } }
    }
    if (article.state !== 'published') {
        return { error: { code: 403, message: '只能对已发布文章发表评论' } }
    }

    // 回复必须属于同一篇文章，防止跨文章构造评论树。
    if (parsedParentId > 0) {
        const [parentComment] = await query(
            'SELECT id, parent_id FROM comment WHERE id = ? AND article_id = ? AND status = 1',
            [parsedParentId, parsedArticleId]
        )
        if (!parentComment) {
            return { error: { code: 404, message: '父评论不存在、已删除或不属于当前文章' } }
        }
        // 仅支持两级评论：不能回复二级评论（parent_id > 0 的评论）
        if (Number(parentComment.parent_id) > 0) {
            return { error: { code: 400, message: '只能回复一级评论' } }
        }
    }

    const result = await commentModel.createComment({
        userId,
        articleId: parsedArticleId,
        content: content.trim(),
        parentId: parsedParentId
    })

    return {
        data: {
            commentId: result.commentId,
            articleId: parsedArticleId,
            parentId: parsedParentId
        }
    }
}

/**
 * 新增评论（支持一级评论/二级回复）
 */
async function createComment(req, res) {
    try {
        const { userId } = req.user // 从Token获取当前用户ID和类型
        const normalized = await submitComment(req.body, userId)
        if (normalized.error) {
            return res.status(normalized.error.code).json({
                code: normalized.error.code,
                message: normalized.error.message
            })
        }

        const { commentId, parentId } = normalized.data
        writeSystemLog({
            userId,
            action: 'create',
            module: 'comment',
            targetType: 'comment',
            targetId: commentId,
            detail: parentId > 0 ? `回复评论 #${parentId}` : '发表评论',
            ip: req.ip || null,
        })

        res.status(201).json({
            code: 200,
            message: '评论成功',
            data: {
                commentId, // 新增评论ID
                createdAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '评论失败：' + err.message })
    }
}

/**
 * 门户公开评论发表（需登录，访客拒绝并提示登录）
 * 与后台共用同一套校验：只能评论已发布文章、只支持两级评论。
 */
async function createPublicComment(req, res) {
    try {
        const { userId, userType } = req.user
        if (userType === 'visitor' || !userId) {
            return res.status(401).json({ code: 401, message: '请先登录后再发表评论' })
        }

        const normalized = await submitComment(req.body, userId)
        if (normalized.error) {
            return res.status(normalized.error.code).json({
                code: normalized.error.code,
                message: normalized.error.message
            })
        }

        const { commentId, articleId, parentId } = normalized.data
        writeSystemLog({
            userId,
            action: 'create',
            module: 'comment',
            targetType: 'comment',
            targetId: commentId,
            detail: parentId > 0 ? `门户回复评论 #${parentId}` : '门户发表评论',
            ip: req.ip || null,
        })

        res.status(201).json({
            code: 200,
            message: '评论成功',
            data: {
                commentId,
                articleId,
                parentId,
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

        writeSystemLog({
            userId,
            action: 'delete',
            module: 'comment',
            targetType: 'comment',
            targetId: Number(commentId) || null,
            detail: '删除评论',
            ip: req.ip || null,
        })

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
    getPublicComments,
    createComment,
    createPublicComment,
    deleteComment,
    getMyComments
}
