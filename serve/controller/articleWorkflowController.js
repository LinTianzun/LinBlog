const articleWorkflowModel = require('../model/dbModel/articleWorkflow/index')
const articleModel = require('../model/dbModel/article/index')
const { getArticleScope } = require('../utils/accessControl')
const { writeSystemLog } = require('../utils/logHelper')

function sendError(res, status, message) {
    return res.status(status).json({ code: status, message })
}

function parsePositiveId(value) {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

function validatePayload(body = {}) {
    const {
        title, content, classify, subsetId,
        label, introduce, cover,
    } = body

    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 150) {
        return { error: '文章标题长度需在1-150字之间' }
    }
    if (typeof content !== 'string' || content.length === 0) {
        return { error: '文章内容不能为空' }
    }
    if (classify !== undefined && !['article', 'image'].includes(classify)) {
        return { error: '内容类型仅支持 article/image' }
    }
    if (subsetId !== undefined && subsetId !== null && !Number.isSafeInteger(Number(subsetId))) {
        return { error: '分类ID必须是数字或null' }
    }
    if (label !== undefined && label !== null && typeof label !== 'string') {
        return { error: '文章标签必须是字符串或null' }
    }
    if (introduce !== undefined && introduce !== null && typeof introduce !== 'string') {
        return { error: '文章简介必须是字符串或null' }
    }
    if (typeof introduce === 'string' && introduce.length > 512) {
        return { error: '文章简介长度不能超过512字' }
    }
    if (cover !== undefined && cover !== null && typeof cover !== 'string') {
        return { error: '封面地址必须是字符串或null' }
    }

    return {
        data: {
            title: title.trim(),
            content,
            classify,
            subsetId: subsetId === null || subsetId === undefined ? null : Number(subsetId),
            label: label ?? '',
            introduce: introduce ?? '',
            cover: cover ?? '',
        },
    }
}

/**
 * 控制器统一做两步权限判定：先读真实 classify 选权限前缀，
 * 再用当前用户的作用域判断归属与可编辑状态。
 */
async function resolveAccess(req, articleId, action = 'update') {
    const probe = await articleWorkflowModel.findArticleForWorkflow(articleId)
    if (!probe) return { exists: false, allowed: false }

    const scope = getArticleScope(req.user, probe.classify)
    const access = await articleModel.findArticleMutationAccess(
        articleId,
        req.user.userId,
        scope,
        action
    )
    return {
        exists: access.exists,
        allowed: access.allowed,
        article: probe,
        scope,
    }
}

async function getWorkflow(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const probe = await articleWorkflowModel.findArticleForWorkflow(articleId)
        if (!probe) return sendError(res, 404, '文章不存在或已删除')

        // 读取工作稿按「可查看」判定，而不是「可编辑」：
        // 只能看不能改的用户仍应能打开编辑页查看当前稿与版本历史。
        const scope = getArticleScope(req.user, probe.classify)
        const ownsArticle = Number(probe.userId) === Number(req.user.userId)
        const canView = scope.viewAll ||
            (scope.viewOwn && (ownsArticle || probe.state === 'published'))
        if (!canView) return sendError(res, 403, '无权限查看该文章的工作稿')

        const state = await articleWorkflowModel.findWorkflowState(articleId)
        if (!state) return sendError(res, 404, '文章不存在或已删除')

        res.json({ code: 200, message: '查询成功', data: state })
    } catch (err) {
        res.status(500).json({ code: 500, message: '读取内容工作流失败：' + err.message })
    }
}

async function saveDraft(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const validation = validatePayload(req.body)
        if (validation.error) return sendError(res, 400, validation.error)

        const access = await resolveAccess(req, articleId)
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限保存该文章')

        const expectedRevision = Number(req.body?.revision)
        const result = await articleWorkflowModel.saveWorkingCopy(
            articleId,
            {
                ...validation.data,
                classify: validation.data.classify || access.article.classify,
            },
            {
                userId: req.user.userId,
                source: req.body?.source === 'manual' ? 'manual' : 'autosave',
                expectedRevision: Number.isSafeInteger(expectedRevision) ? expectedRevision : undefined,
            }
        )

        if (result.conflict) {
            return res.status(409).json({
                code: 409,
                message: '工作稿已在其他窗口更新，请刷新后继续编辑',
                data: { revision: result.revision },
            })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: access.article.classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: articleId,
            detail: req.body?.source === 'manual' ? '保存内容工作稿' : '自动保存内容工作稿',
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '工作稿已保存',
            data: {
                articleId,
                revision: result.revision,
                savedAt: result.savedAt,
                hasUnpublishedChanges: result.hasUnpublishedChanges,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '保存内容工作稿失败：' + err.message })
    }
}

async function getVersions(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const access = await resolveAccess(req, articleId)
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限查看版本历史')

        const result = await articleWorkflowModel.listVersions(articleId, {
            page: req.query?.page,
            pageSize: req.query?.pageSize,
        })
        res.json({ code: 200, message: '查询成功', data: result })
    } catch (err) {
        res.status(500).json({ code: 500, message: '读取版本历史失败：' + err.message })
    }
}

async function getVersion(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        const versionId = parsePositiveId(req.params.versionId)
        if (!articleId || !versionId) return sendError(res, 400, '请传入有效的文章和版本ID')

        const access = await resolveAccess(req, articleId)
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限查看版本历史')

        const version = await articleWorkflowModel.findVersion(articleId, versionId)
        if (!version) return sendError(res, 404, '版本不存在')
        res.json({ code: 200, message: '查询成功', data: version })
    } catch (err) {
        res.status(500).json({ code: 500, message: '读取版本详情失败：' + err.message })
    }
}

async function restoreVersion(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        const versionId = parsePositiveId(req.params.versionId)
        if (!articleId || !versionId) return sendError(res, 400, '请传入有效的文章和版本ID')

        const access = await resolveAccess(req, articleId)
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限回滚该文章')

        const version = await articleWorkflowModel.findVersion(articleId, versionId)
        if (!version) return sendError(res, 404, '版本不存在')

        const result = await articleWorkflowModel.restoreVersion(articleId, versionId, {
            userId: req.user.userId,
        })
        if (!result.found) return sendError(res, 404, '文章不存在或已删除')

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: access.article.classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: articleId,
            detail: `回滚到版本 #${version.revision}`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '已恢复为新的工作稿，确认预览后可发布',
            data: {
                articleId,
                revision: result.revision,
                restoredFrom: version.revision,
            },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '回滚版本失败：' + err.message })
    }
}

async function publishWorkflow(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const access = await resolveAccess(req, articleId, 'status')
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限发布该文章')
        if (!access.scope.publish) return sendError(res, 403, '当前账号没有发布权限')

        const result = await articleWorkflowModel.publishWorkingCopy(articleId, {
            userId: req.user.userId,
        })
        if (!result.found) return sendError(res, 404, '文章不存在或已删除')

        writeSystemLog({
            userId: req.user.userId,
            action: 'publish',
            module: access.article.classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: articleId,
            detail: '发布内容工作稿',
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '工作稿已发布',
            data: { articleId, state: 'published', revision: result.revision },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '发布内容工作稿失败：' + err.message })
    }
}

async function scheduleWorkflow(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const raw = req.body?.scheduledAt
        const scheduledAt = new Date(raw)
        if (!raw || Number.isNaN(scheduledAt.getTime())) {
            return sendError(res, 400, '请传入有效的计划发布时间')
        }
        if (scheduledAt.getTime() < Date.now() + 60_000) {
            return sendError(res, 400, '计划发布时间至少需晚于当前时间 1 分钟')
        }

        const access = await resolveAccess(req, articleId, 'status')
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限安排该文章发布')
        if (!access.scope.publish) return sendError(res, 403, '当前账号没有发布权限')

        const result = await articleWorkflowModel.schedulePublish(articleId, scheduledAt, {
            userId: req.user.userId,
        })
        if (!result.found) return sendError(res, 404, '文章不存在或已删除')

        writeSystemLog({
            userId: req.user.userId,
            action: 'status',
            module: access.article.classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: articleId,
            detail: `安排于 ${scheduledAt.toISOString()} 发布`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '已安排定时发布',
            data: { articleId, scheduledAt: scheduledAt.toISOString() },
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '安排定时发布失败：' + err.message })
    }
}

async function cancelSchedule(req, res) {
    try {
        const articleId = parsePositiveId(req.params.id)
        if (!articleId) return sendError(res, 400, '请传入有效的文章ID')

        const access = await resolveAccess(req, articleId, 'status')
        if (!access.exists) return sendError(res, 404, '文章不存在或已删除')
        if (!access.allowed) return sendError(res, 403, '无权限取消该文章的计划发布')

        const cleared = await articleWorkflowModel.clearScheduledArticle(articleId)
        if (!cleared) return sendError(res, 404, '文章不存在或没有待执行的计划发布')

        writeSystemLog({
            userId: req.user.userId,
            action: 'status',
            module: access.article.classify === 'image' ? 'gallery' : 'article',
            targetType: 'article',
            targetId: articleId,
            detail: '取消定时发布',
            ip: req.ip || null,
        })
        res.json({ code: 200, message: '已取消定时发布', data: { articleId } })
    } catch (err) {
        res.status(500).json({ code: 500, message: '取消定时发布失败：' + err.message })
    }
}

module.exports = {
    getWorkflow,
    saveDraft,
    getVersions,
    getVersion,
    restoreVersion,
    publishWorkflow,
    scheduleWorkflow,
    cancelSchedule,
    validatePayload,
}
