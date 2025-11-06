const articleModel = require('../model/dbModel/article/index')
const { formatPaginationParams } = require('../utils/paginationUtil')

/**
 * 新增文章
 */
async function createArticle(req, res) {
    try {
        const {
            title, content, classify, subsetId,
            label, introduce, cover
        } = req.body
        const { userId } = req.user

        //  必传参数校验
        if (!title || !content || !classify) {
            return res.status(400).json({
                code: 400,
                message: '文章标题、内容、内容类型（classify）不能为空'
            })
        }

        //  字段格式校验
        if (title.length < 1 || title.length > 150) {
            return res.status(400).json({ code: 400, message: '文章标题长度需在1-150字之间' })
        }
        if (introduce && introduce.length > 512) {
            return res.status(400).json({ code: 400, message: '文章简介长度不能超过512字' })
        }
        if (!['article', 'image'].includes(classify)) {
            return res.status(400).json({ code: 400, message: '内容类型仅支持 article（文章）/ image（图片集）' })
        }
        if (subsetId && isNaN(subsetId)) {
            return res.status(400).json({ code: 400, message: '分类ID必须是数字类型' })
        }

        //  调用模型新增
        const result = await articleModel.insertArticle({
            title,
            content,
            classify,
            subsetId: subsetId || null,
            label: label || '',
            introduce: introduce || '',
            cover: cover || '',
            userId
        })

        res.status(201).json({
            code: 200,
            message: '文章创建成功（默认保存为草稿）',
            data: {
                articleId: result.articleId,
                createdAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章创建失败：' + err.message })
    }
}

/**
 *  文章分页查询（支持多条件筛选）
 */
async function getArticles(req, res) {
    try {
        const { userId, userType } = req.user
        const { state, classify, subsetId } = req.query

        //  分页参数校验
        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 10,
            maxPageSize: 50
        })
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data

        //  调用模型查询
        const result = await articleModel.findArticlesByPage({
            page,
            pageSize,
            offset,
            state,          // 可选筛选：draft/published/rejected
            classify,       // 可选筛选：article/image
            subsetId: subsetId && !isNaN(subsetId) ? subsetId : null, // 分类ID筛选
            userId,
            userType
        })

        res.json({
            code: 200,
            message: result.total > 0 ? '查询成功' : '暂无相关文章',
            data: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
                totalPage: result.totalPage,
                list: result.list
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章查询失败：' + err.message })
    }
}

/**
 * 根据ID查询文章详情
 */
async function getArticleById(req, res) {
    try {
        const { id: articleId } = req.params
        const { userId, userType } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        //  调用模型查询
        const article = await articleModel.findAtricleById(articleId, userId, userType)
        if (!article) {
            return res.status(404).json({ code: 404, message: '文章不存在或无权限访问' })
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: article
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章查询失败：' + err.message })
    }
}

/**
 * 文章编辑更新（支持部分字段更新）
 */
async function updateArticle(req, res) {
    try {
        const { id: articleId } = req.params
        const {
            title, content, classify, subsetId,
            label, introduce, cover, state
        } = req.body
        const { userId, userType } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        //  检验更新字段
        const updateData = {}
        if (title !== undefined) {
            if (title.length < 1 || title.length > 150) {
                return res.status(400).json({ code: 400, message: '文章标题长度需在1-150字之间' })
            }
            updateData.title = title
        }

        if (content !== undefined) updateData.content = content

        if (classify !== undefined) {
            if (!['article', 'image'].includes(classify)) {
                return res.status(400).json({ code: 400, message: '内容类型仅支持 article/image' })
            }
            updateData.classify = classify
        }

        if (subsetId !== undefined) {
            if (subsetId !== null && isNaN(subsetId)) {
                return res.status(400).json({ code: 400, message: '分类ID必须是数字或null' })
            }
            updateData.subsetId = subsetId
        }

        if (label !== undefined) updateData.label = label

        if (introduce !== undefined) {
            if (introduce.length > 512) {
                return res.status(400).json({ code: 400, message: '文章简介长度不能超过512字' })
            }
            updateData.introduce = introduce
        }

        if (cover !== undefined) updateData.cover = cover

        if (state !== undefined) {
            if (!['draft', 'published', 'rejected'].includes(state)) {
                return res.status(400).json({ code: 400, message: '状态仅支持 draft/published/rejected' })
            }
            updateData.state = state
        }

        //  至少传入一个更新字段
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ code: 400, message: '请传入至少一个更新字段' })
        }

        //  调用模型更新
        const affectedRows = await articleModel.updateArticle(
            articleId,
            updateData,
            userId,
            userType
        )

        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限更新该文章或文章不存在' })
        }

        res.json({
            code: 200,
            message: '文章更新成功',
            data: {
                articleId,
                updatedAt: new Date().toISOString(),
                state: updateData.state || '未修改状态'
            }
        })

    } catch (err) {
        res.status(500).json({ code: 500, message: '文章更新失败：' + err.message })
    }
}

/**
 * 文章删除(逻辑删除)
 */
async function deleteArticle(req, res) {
    try {
        const { id: articleId } = req.params
        const { userId, userType } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        //  调用模型删除
        const affectedRows = await articleModel.deleteArticle(articleId, userId, userType)
        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限删除该文章或文章不存在' })
        }

        res.json({ code: 200, message: '文章删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章删除失败：' + err.message })
    }
}

/**
 * 文章状态修改（支持草稿/已发布/已驳回）
 */
async function updateArticleStatus(req, res) {
    try {
        const { id: articleId } = req.params
        // 关键：确保从请求体获取state，变量名是state（无拼写错误）
        const { state } = req.body
        const { userId, userType } = req.user

        // 1. 校验参数（先校验是否存在，再校验合法性）
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }
        // 先判断state是否存在（避免undefined）
        if (!state) {
            return res.status(400).json({ code: 400, message: '状态值不能为空' })
        }
        // 再判断状态合法性
        if (!['draft', 'published', 'rejected'].includes(state)) {
            return res.status(400).json({
                code: 400,
                message: '状态值无效，仅支持 draft（草稿）/ published（已发布）/ rejected（已驳回）'
            })
        }

        //  调用模型修改状态（参数顺序：articleId → state → userId → userType）
        const affectedRows = await articleModel.updateArticleStatus(articleId, state, userId, userType)
        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限修改该文章状态或文章不存在' })
        }

        // 状态中文映射
        const stateMap = {
            draft: '草稿',
            published: '已发布',
            rejected: '已驳回'
        }

        res.json({
            code: 200,
            message: `文章状态已更新为${stateMap[state]}`,
            data: {
                articleId,
                state,
                updatedAt: new Date().toISOString()
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章状态修改失败：' + err.message })
    }
}

module.exports = {
    createArticle,
    getArticles,
    getArticleById,
    updateArticle,
    deleteArticle,
    updateArticleStatus
}