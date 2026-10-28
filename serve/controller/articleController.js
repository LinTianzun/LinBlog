const articleModel = require('../model/dbModel/article/index')
const imageModel = require('../model/dbModel/image/index')
const { formatPaginationParams } = require('../utils/paginationUtil')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission, getArticleScope } = require('../utils/accessControl')

const uploadsUrlPattern = /^\/api\/uploads\/([A-Za-z0-9._-]+)$/

function extractUploadsFilename(coverUrl) {
    if (typeof coverUrl !== 'string') return null
    const match = coverUrl.trim().match(uploadsUrlPattern)
    return match ? match[1] : null
}

// 封面被替换/删除后，若数据库中的图片行已无任何业务引用则软删，避免孤儿图片。
// 清理失败只记录日志，不影响主流程。
async function cleanupCover(coverUrl) {
    const filename = extractUploadsFilename(coverUrl)
    if (!filename) return
    try {
        const result = await imageModel.deactivateImageIfUnreferenced(filename)
        if (result.deactivated) {
            console.log(`[Article] 已清理无引用封面图片 ${filename}`)
        }
    } catch (err) {
        console.warn('[Article] 清理封面图片失败：', err.message)
    }
}

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

        const createPermission = classify === 'image' ? 'gallery.create' : 'article.create'
        if (!hasPermission(req.user, createPermission)) {
            return res.status(403).json({ code: 403, message: '当前用户无权创建该类型内容' })
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

        writeSystemLog({
            userId,
            action: 'create',
            module: classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: result.articleId,
            detail: `创建${classify === 'image' ? '图库' : '文章'}「${title}」`,
            ip: req.ip || null,
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
        const { userId } = req.user
        const { state, classify, subsetId, keyword, uncategorized, label } = req.query

        //  分页参数校验
        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 10,
            maxPageSize: 50
        })
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data
        const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : ''

        if (normalizedKeyword.length > 100) {
            return res.status(400).json({ code: 400, message: '搜索关键词不能超过100字' })
        }

        //  调用模型查询
        const result = await articleModel.findArticlesByPage({
            page,
            pageSize,
            offset,
            state,          // 可选筛选：draft/published/rejected
            classify,       // 可选筛选：article/image
            withContent: classify === 'image',  // 图库列表返回 content 供预览小图
            subsetId: subsetId && !isNaN(subsetId) ? subsetId : null, // 分类ID筛选
            uncategorized: uncategorized === 'true' || uncategorized === true,
            label: typeof label === 'string' ? label.trim() : undefined,
            keyword: normalizedKeyword,
            userId,
            userAccess: getArticleScope(req.user, classify === 'image' ? 'image' : 'article')
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
        const { userId } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        // 先读取内容类型，再按对应模块的权限决定可见范围。
        const article = await articleModel.findAtricleById(articleId, userId, 'admin')
        if (!article) {
            return res.status(404).json({ code: 404, message: '文章不存在或无权限访问' })
        }

        const scope = getArticleScope(req.user, article.classify)
        const ownsArticle = Number(article.userId) === Number(userId)
        const canView = scope.viewAll ||
            (scope.viewOwn && (ownsArticle || article.state === 'published'))
        if (!canView) {
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
 * 门户公开文章列表：始终只返回已发布内容。
 * 即使访问者已登录，也不能把后台「普通用户只看自己文章」的权限口径带入门户。
 */
async function getPublicArticles(req, res) {
    try {
        const { classify, subsetId, keyword, label, sort } = req.query

        const paginationResult = formatPaginationParams(req.query, {
            defaultPageSize: 10,
            maxPageSize: 50
        })
        if (!paginationResult.success) {
            return res.status(400).json({ code: 400, message: paginationResult.errorMsg })
        }
        const { page, pageSize, offset } = paginationResult.data
        const normalizedKeyword = typeof keyword === 'string' ? keyword.trim() : ''
        if (normalizedKeyword.length > 100) {
            return res.status(400).json({ code: 400, message: '搜索关键词不能超过100字' })
        }

        const result = await articleModel.findArticlesByPage({
            page,
            pageSize,
            offset,
            state: 'published',
            classify: ['article', 'image'].includes(classify) ? classify : 'article',
            withContent: classify === 'image',
            subsetId: subsetId && !isNaN(subsetId) ? subsetId : null,
            label: typeof label === 'string' ? label.trim() : undefined,
            keyword: normalizedKeyword,
            // sort=hot 按浏览量排序，门户「最热」切换使用
            sort: sort === 'hot' ? 'hot' : 'latest',
            userId: null,
            userType: 'visitor'
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
        res.status(500).json({ code: 500, message: '公开文章查询失败：' + err.message })
    }
}

/**
 * 门户公开文章详情：始终只按游客权限读取已发布内容。
 */
async function getPublicArticleById(req, res) {
    try {
        const articleId = Number(req.params.id)
        if (!Number.isSafeInteger(articleId) || articleId <= 0) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const article = await articleModel.findAtricleById(articleId, null, 'visitor')
        if (!article) {
            return res.status(404).json({ code: 404, message: '文章不存在或未发布' })
        }

        res.json({ code: 200, message: '查询成功', data: article })
    } catch (err) {
        res.status(500).json({ code: 500, message: '公开文章查询失败：' + err.message })
    }
}

/**
 *  文章状态统计（供状态页签展示：全部/已发布/未发布/未分类）
 */
async function getArticleStateSummary(req, res) {
    try {
        const { userId } = req.user
        const { classify } = req.query

        const summary = await articleModel.countArticlesByState({
            classify: classify && ['article', 'image'].includes(classify) ? classify : undefined,
            userId,
            userAccess: getArticleScope(req.user, classify === 'image' ? 'image' : 'article')
        })

        res.json({
            code: 200,
            message: '查询成功',
            data: summary
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章统计查询失败：' + err.message })
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
        const { userId } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        //  检验更新字段
        const updateData = {}
        if (title !== undefined) {
            if (typeof title !== 'string') {
                return res.status(400).json({ code: 400, message: '文章标题必须是字符串' })
            }
            if (title.length < 1 || title.length > 150) {
                return res.status(400).json({ code: 400, message: '文章标题长度需在1-150字之间' })
            }
            updateData.title = title
        }

        if (content !== undefined) {
            if (typeof content !== 'string' || content.length === 0) {
                return res.status(400).json({ code: 400, message: '文章内容不能为空' })
            }
            updateData.content = content
        }

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

        if (label !== undefined) {
            if (label !== null && typeof label !== 'string') {
                return res.status(400).json({ code: 400, message: '文章标签必须是字符串或null' })
            }
            updateData.label = label
        }

        if (introduce !== undefined) {
            if (introduce !== null && typeof introduce !== 'string') {
                return res.status(400).json({ code: 400, message: '文章简介必须是字符串或null' })
            }
            if (introduce && introduce.length > 512) {
                return res.status(400).json({ code: 400, message: '文章简介长度不能超过512字' })
            }
            updateData.introduce = introduce
        }

        if (cover !== undefined) {
            if (cover !== null && typeof cover !== 'string') {
                return res.status(400).json({ code: 400, message: '封面地址必须是字符串或null' })
            }
            updateData.cover = cover
        }

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

        const probe = await articleModel.findArticleMutationAccess(
            articleId,
            userId,
            'admin',
            'update'
        )

        if (!probe.exists) {
            return res.status(404).json({ code: 404, message: '文章不存在或已删除' })
        }

        const scope = getArticleScope(req.user, probe.article.classify)
        if (state !== undefined && state !== 'draft' && !scope.publish) {
            return res.status(403).json({ code: 403, message: '当前账号没有发布或驳回该内容的权限' })
        }

        const access = await articleModel.findArticleMutationAccess(
            articleId,
            userId,
            scope,
            'update'
        )

        if (!access.allowed) {
            return res.status(403).json({ code: 403, message: '无权限更新该文章' })
        }

        const previousCover = access.article.cover

        //  调用模型更新
        const affectedRows = await articleModel.updateArticle(
            articleId,
            updateData,
            userId,
            scope
        )

        if (affectedRows === 0) {
            // 更新值与数据库一致时 MySQL 可能返回 0；再次确认权限和存在性。
            const latestAccess = await articleModel.findArticleMutationAccess(
                articleId,
                userId,
                scope,
                'update'
            )

            if (!latestAccess.exists) {
                return res.status(404).json({ code: 404, message: '文章不存在或已删除' })
            }

            if (!latestAccess.allowed) {
                return res.status(403).json({ code: 403, message: '无权限更新该文章' })
            }
        }

        // 封面确实被替换时才清理旧图（值未变时 MySQL 返回 0 行也跳过）
        if (
            updateData.cover !== undefined &&
            previousCover &&
            previousCover !== updateData.cover
        ) {
            await cleanupCover(previousCover)
        }

        writeSystemLog({
            userId,
            action: 'update',
            module: 'article',
            targetType: 'article',
            targetId: articleId,
            detail: '更新文章内容',
            ip: req.ip || null,
        })

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
        const { userId } = req.user

        //  校验文章ID
        if (!articleId || isNaN(articleId)) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const probe = await articleModel.findArticleMutationAccess(articleId, userId, 'admin', 'delete')
        if (!probe.exists) {
            return res.status(404).json({ code: 404, message: '文章不存在或已删除' })
        }
        const scope = getArticleScope(req.user, probe.article.classify)
        const access = await articleModel.findArticleMutationAccess(articleId, userId, scope, 'delete')
        const oldCover = access.exists ? access.article.cover : null

        //  调用模型删除
        const affectedRows = await articleModel.deleteArticle(articleId, userId, scope)
        if (affectedRows === 0) {
            return res.status(403).json({ code: 403, message: '无权限删除该文章或文章不存在' })
        }

        await cleanupCover(oldCover)

        writeSystemLog({
            userId,
            action: 'delete',
            module: 'article',
            targetType: 'article',
            targetId: articleId,
            detail: '删除文章（逻辑删除）',
            ip: req.ip || null,
        })

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
        const { userId } = req.user

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

        const probe = await articleModel.findArticleMutationAccess(
            articleId,
            userId,
            'admin',
            'status'
        )

        if (!probe.exists) {
            return res.status(404).json({ code: 404, message: '文章不存在或已删除' })
        }

        const scope = getArticleScope(req.user, probe.article.classify)
        if (state !== 'draft' && !scope.publish) {
            return res.status(403).json({ code: 403, message: '当前账号没有发布或驳回该内容的权限' })
        }

        const access = await articleModel.findArticleMutationAccess(
            articleId,
            userId,
            scope,
            'status'
        )

        if (!access.allowed) {
            return res.status(403).json({ code: 403, message: '无权限修改该文章状态' })
        }

        //  调用模型修改状态（参数顺序：articleId → state → userId → userType）
        const affectedRows = await articleModel.updateArticleStatus(articleId, state, userId, scope)
        if (affectedRows === 0) {
            const latestAccess = await articleModel.findArticleMutationAccess(
                articleId,
                userId,
                scope,
                'status'
            )

            if (!latestAccess.exists) {
                return res.status(404).json({ code: 404, message: '文章不存在或已删除' })
            }

            if (!latestAccess.allowed) {
                return res.status(403).json({ code: 403, message: '无权限修改该文章状态' })
            }
        }

        // 状态中文映射
        const stateMap = {
            draft: '草稿',
            published: '已发布',
            rejected: '已驳回'
        }

        writeSystemLog({
            userId,
            action: state === 'published' ? 'publish' : state === 'rejected' ? 'revoke' : 'status',
            module: 'article',
            targetType: 'article',
            targetId: articleId,
            detail: `文章状态变更为「${stateMap[state]}」`,
            ip: req.ip || null,
        })

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
    getPublicArticles,
    getArticleStateSummary,
    getArticleById,
    getPublicArticleById,
    updateArticle,
    deleteArticle,
    updateArticleStatus
}
