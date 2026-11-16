const collectionModel = require('../model/dbModel/collection/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')

const MAX_ARTICLES = 200

function parseVersionRetention(value) {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)
        || parsed < 1
        || parsed > collectionModel.MAX_VERSION_RETENTION) {
        return null
    }
    return parsed
}

function canManageCollection(user) {
    return hasPermission(user, 'collection.manage')
}

function canViewCollection(user) {
    return canManageCollection(user) || hasPermission(user, 'collection.view')
}

function formatCollection(row, { includeArticles = false } = {}) {
    const articles = Array.isArray(row.articles) ? row.articles : []
    const result = {
        id: row.id,
        name: row.name,
        description: row.description || '',
        cover: row.cover || '',
        sort: Number(row.sort) || 0,
        status: Number(row.status),
        articleCount: Number(row.articleCount ?? articles.length) || 0,
        publishedCount: Number(
            row.publishedCount ?? articles.filter(article => article.state === 'published').length
        ) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    }

    if (includeArticles) {
        result.articles = articles.map(article => ({
            id: article.id,
            userId: article.userId,
            title: article.title,
            introduce: article.introduce || '',
            cover: article.cover || '',
            classify: article.classify,
            state: article.state,
            label: article.label || '',
            views: Number(article.views) || 0,
            likes: Number(article.likes) || 0,
            comments: Number(article.comments) || 0,
            subsetId: article.subsetId,
            subsetName: article.subsetName,
            memberSort: Number(article.memberSort) || 0,
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
            publishedAt: article.publishedAt
        }))
    }

    return result
}

function longestCommonSubsequence(left, right) {
    const rows = left.length
    const cols = right.length
    const dp = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0))

    for (let row = 1; row <= rows; row += 1) {
        for (let col = 1; col <= cols; col += 1) {
            dp[row][col] = left[row - 1] === right[col - 1]
                ? dp[row - 1][col - 1] + 1
                : Math.max(dp[row - 1][col], dp[row][col - 1])
        }
    }

    const result = []
    let row = rows
    let col = cols
    while (row > 0 && col > 0) {
        if (left[row - 1] === right[col - 1]) {
            result.push(left[row - 1])
            row -= 1
            col -= 1
        } else if (dp[row - 1][col] >= dp[row][col - 1]) {
            row -= 1
        } else {
            col -= 1
        }
    }
    return result.reverse()
}

function buildCollectionVersionDiff(version, current) {
    const versionIds = (version.articleIds || []).map(Number)
    const currentArticles = Array.isArray(current.articles) ? current.articles : []
    const currentIds = currentArticles.map(article => Number(article.id))
    const currentArticlesById = new Map(
        currentArticles.map(article => [Number(article.id), article])
    )
    const versionArticlesById = new Map(
        (version.articles || []).map(article => [Number(article.id), article])
    )
    const versionIndex = new Map(versionIds.map((id, index) => [id, index + 1]))
    const currentIndex = new Map(currentIds.map((id, index) => [id, index + 1]))
    const versionIdSet = new Set(versionIds)
    const currentIdSet = new Set(currentIds)
    const commonVersionIds = versionIds.filter(id => currentIdSet.has(id))
    const commonCurrentIds = currentIds.filter(id => versionIdSet.has(id))
    const stableIds = new Set(longestCommonSubsequence(commonVersionIds, commonCurrentIds))
    const movedIds = commonCurrentIds.filter(id => !stableIds.has(id))

    const metaChanges = [
        { field: 'name', label: '系列名称', before: version.name || '', after: current.name || '' },
        { field: 'description', label: '系列说明', before: version.description || '', after: current.description || '' },
        { field: 'cover', label: '系列封面', before: version.cover || '', after: current.cover || '' },
        { field: 'sort', label: '排序权重', before: String(version.sort || 0), after: String(current.sort || 0) }
    ].filter(item => item.before !== item.after)

    const articleChanges = []
    for (const articleId of currentIds) {
        if (!versionIdSet.has(articleId)) {
            const article = currentArticlesById.get(articleId)
            articleChanges.push({
                kind: 'added',
                id: articleId,
                title: article?.title || `文章 #${articleId}`,
                state: article?.state,
                subsetName: article?.subsetName || '',
                fromPosition: null,
                toPosition: currentIndex.get(articleId)
            })
            continue
        }
        if (!stableIds.has(articleId)) {
            const article = currentArticlesById.get(articleId)
            articleChanges.push({
                kind: 'moved',
                id: articleId,
                title: article?.title || `文章 #${articleId}`,
                state: article?.state,
                subsetName: article?.subsetName || '',
                fromPosition: versionIndex.get(articleId),
                toPosition: currentIndex.get(articleId)
            })
        }
    }
    for (const articleId of versionIds) {
        if (currentIdSet.has(articleId)) continue
        const article = versionArticlesById.get(articleId)
        articleChanges.push({
            kind: 'removed',
            id: articleId,
            title: article?.title || `文章 #${articleId}`,
            state: article?.state,
            subsetName: article?.subsetName || '',
            missing: Boolean(article?.missing),
            fromPosition: versionIndex.get(articleId),
            toPosition: null
        })
    }

    const added = articleChanges.filter(item => item.kind === 'added').length
    const removed = articleChanges.filter(item => item.kind === 'removed').length
    const moved = articleChanges.filter(item => item.kind === 'moved').length
    const unchanged = commonCurrentIds.length - moved
    return {
        version: {
            id: version.id,
            revision: version.revision,
            name: version.name,
            source: version.source,
            operatorName: version.operatorName,
            createdAt: version.createdAt
        },
        current: {
            name: current.name,
            description: current.description || '',
            cover: current.cover || '',
            sort: Number(current.sort) || 0,
            articleCount: currentIds.length,
            publishedCount: Number(current.publishedCount) || 0,
            updatedAt: current.updatedAt
        },
        metaChanges,
        articleChanges,
        summary: {
            metaCount: metaChanges.length,
            added,
            removed,
            moved,
            unchanged,
            hasChanges: metaChanges.length > 0 || articleChanges.length > 0
        }
    }
}

function parseCollectionId(value) {
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizeText(value, maxLength) {
    if (value === undefined) return undefined
    if (value === null) return ''
    return String(value).trim().slice(0, maxLength)
}

function normalizeSort(value) {
    const sort = Number(value)
    return Number.isFinite(sort) ? Math.max(0, Math.trunc(sort)) : 0
}

function normalizeArticleIds(value) {
    if (!Array.isArray(value)) return null
    const ids = value
        .map(Number)
        .filter(id => Number.isSafeInteger(id) && id > 0)
    return [...new Set(ids)].slice(0, MAX_ARTICLES)
}

async function getPublicCollections(req, res) {
    try {
        const rows = await collectionModel.findCollections({ publicOnly: true })
        const list = rows
            .filter(row => Number(row.publishedCount) > 0)
            .map(row => formatCollection(row))

        res.json({
            code: 200,
            message: list.length > 0 ? '查询成功' : '暂无系列',
            data: { count: list.length, list }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列查询失败：' + err.message })
    }
}

async function getPublicCollectionById(req, res) {
    try {
        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const collection = await collectionModel.findCollectionById(id, { publicOnly: true })
        if (!collection || collection.articles.length === 0) {
            return res.status(404).json({ code: 404, message: '系列不存在或暂无已发布文章' })
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: formatCollection(collection, { includeArticles: true })
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列详情查询失败：' + err.message })
    }
}

async function getPublicCollectionsForArticle(req, res) {
    try {
        const articleId = parseCollectionId(req.params.articleId)
        if (!articleId) {
            return res.status(400).json({ code: 400, message: '请传入有效的文章ID' })
        }

        const list = await collectionModel.findPublicCollectionsForArticle(articleId)
        res.json({
            code: 200,
            message: '查询成功',
            data: { count: list.length, list }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文章系列查询失败：' + err.message })
    }
}

async function getCollections(req, res) {
    try {
        if (!canViewCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以查看系列管理' })
        }

        const rows = await collectionModel.findCollections()
        const list = rows.map(row => formatCollection(row))
        res.json({
            code: 200,
            message: '查询成功',
            data: { count: list.length, list }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列查询失败：' + err.message })
    }
}

async function getCollectionById(req, res) {
    try {
        if (!canViewCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以查看系列管理' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const collection = await collectionModel.findCollectionById(id)
        if (!collection) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: formatCollection(collection, { includeArticles: true })
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列详情查询失败：' + err.message })
    }
}

async function createCollection(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以创建系列' })
        }

        const name = normalizeText(req.body?.name, 80)
        const description = normalizeText(req.body?.description, 500) || ''
        const cover = normalizeText(req.body?.cover, 255) || ''
        if (!name) {
            return res.status(400).json({ code: 400, message: '系列名称不能为空' })
        }

        const rawArticleIds = req.body?.articleIds
        const articleIds = rawArticleIds === undefined ? [] : normalizeArticleIds(rawArticleIds)
        if (!articleIds) {
            return res.status(400).json({ code: 400, message: 'articleIds 必须是数组' })
        }
        if (Array.isArray(rawArticleIds) && rawArticleIds.length > MAX_ARTICLES) {
            return res.status(400).json({
                code: 400,
                message: `一个系列最多包含 ${MAX_ARTICLES} 篇文章`
            })
        }
        if (articleIds.length > 0) {
            const availableIds = await collectionModel.findAvailableArticleIds(articleIds)
            const availableSet = new Set(availableIds)
            const invalidIds = articleIds.filter(articleId => !availableSet.has(articleId))
            if (invalidIds.length > 0) {
                return res.status(400).json({
                    code: 400,
                    message: `以下文章不存在、已删除或不是文章类型：${invalidIds.join(', ')}`
                })
            }
        }

        const versionRetention = parseVersionRetention(req.body?.versionRetention)
        if (versionRetention === null) {
            return res.status(400).json({
                code: 400,
                message: `版本保留数量必须是 1-${collectionModel.MAX_VERSION_RETENTION} 的整数`
            })
        }

        const result = await collectionModel.insertCollection({
            name,
            description,
            cover,
            sort: normalizeSort(req.body?.sort),
            articleIds,
            ...(versionRetention === undefined ? {} : { versionRetention })
        }, { userId: req.user.userId })

        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'collection',
            targetType: 'collection',
            targetId: result.collectionId,
            detail: `创建内容系列「${name}」`,
            ip: req.ip || null
        })

        res.status(201).json({
            code: 200,
            message: '系列创建成功',
            data: { collectionId: result.collectionId, revision: result.revision }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列创建失败：' + err.message })
    }
}

async function updateCollection(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以修改系列' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const current = await collectionModel.findCollectionById(id)
        if (!current) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        const name = normalizeText(req.body?.name, 80)
        if (req.body?.name !== undefined && !name) {
            return res.status(400).json({ code: 400, message: '系列名称不能为空' })
        }

        const rawArticleIds = req.body?.articleIds
        const hasArticleIds = rawArticleIds !== undefined
        const articleIds = hasArticleIds ? normalizeArticleIds(rawArticleIds) : undefined
        if (hasArticleIds && !articleIds) {
            return res.status(400).json({ code: 400, message: 'articleIds 必须是数组' })
        }
        if (Array.isArray(rawArticleIds) && rawArticleIds.length > MAX_ARTICLES) {
            return res.status(400).json({
                code: 400,
                message: `一个系列最多包含 ${MAX_ARTICLES} 篇文章`
            })
        }
        if (articleIds && articleIds.length > 0) {
            const availableIds = await collectionModel.findAvailableArticleIds(articleIds)
            const availableSet = new Set(availableIds)
            const invalidIds = articleIds.filter(articleId => !availableSet.has(articleId))
            if (invalidIds.length > 0) {
                return res.status(400).json({
                    code: 400,
                    message: `以下文章不存在、已删除或不是文章类型：${invalidIds.join(', ')}`
                })
            }
        }

        const versionRetention = parseVersionRetention(req.body?.versionRetention)
        if (versionRetention === null) {
            return res.status(400).json({
                code: 400,
                message: `版本保留数量必须是 1-${collectionModel.MAX_VERSION_RETENTION} 的整数`
            })
        }

        const saved = await collectionModel.saveCollectionWithArticles(id, {
            name,
            description: normalizeText(req.body?.description, 500),
            cover: normalizeText(req.body?.cover, 255),
            sort: req.body?.sort === undefined ? undefined : normalizeSort(req.body.sort)
        }, articleIds, {
            userId: req.user.userId,
            ...(versionRetention === undefined ? {} : { versionRetention })
        })
        if (!saved.found) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `更新内容系列「${name || current.name}」（修订 #${saved.revision}）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: '系列更新成功',
            data: { collectionId: id, revision: saved.revision, articleCount: saved.articleCount }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列更新失败：' + err.message })
    }
}

async function deleteCollection(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以删除系列' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const current = await collectionModel.findCollectionById(id)
        if (!current) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        await collectionModel.softDeleteCollection(id)

        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `删除内容系列「${current.name}」`,
            ip: req.ip || null
        })

        res.json({ code: 200, message: '系列删除成功' })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列删除失败：' + err.message })
    }
}

async function setCollectionArticles(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以调整系列文章' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const articleIds = normalizeArticleIds(req.body?.articleIds)
        if (!articleIds) {
            return res.status(400).json({ code: 400, message: 'articleIds 必须是数组' })
        }
        if (req.body.articleIds.length > MAX_ARTICLES) {
            return res.status(400).json({
                code: 400,
                message: `一个系列最多包含 ${MAX_ARTICLES} 篇文章`
            })
        }

        const current = await collectionModel.findCollectionById(id)
        if (!current) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        const availableIds = await collectionModel.findAvailableArticleIds(articleIds)
        const availableSet = new Set(availableIds)
        const invalidIds = articleIds.filter(articleId => !availableSet.has(articleId))
        if (invalidIds.length > 0) {
            return res.status(400).json({
                code: 400,
                message: `以下文章不存在、已删除或不是文章类型：${invalidIds.join(', ')}`
            })
        }

        const saved = await collectionModel.replaceCollectionArticlesWithVersion(
            id,
            articleIds,
            { userId: req.user.userId }
        )
        if (!saved.found) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }
        const savedCount = Number(saved.articleCount) || 0

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `调整内容系列「${current.name}」文章顺序（${savedCount} 篇，修订 #${saved.revision}）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: '系列文章保存成功',
            data: { collectionId: id, articleCount: savedCount, revision: saved.revision }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列文章保存失败：' + err.message })
    }
}

async function getCollectionVersions(req, res) {
    try {
        if (!canViewCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以查看系列版本' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const collection = await collectionModel.findCollectionById(id)
        if (!collection) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        const result = await collectionModel.listCollectionVersions(id, {
            page: req.query?.page,
            pageSize: req.query?.pageSize
        })
        res.json({ code: 200, message: '查询成功', data: result })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列版本查询失败：' + err.message })
    }
}

async function getCollectionVersion(req, res) {
    try {
        if (!canViewCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以查看系列版本' })
        }

        const id = parseCollectionId(req.params.id)
        const versionId = parseCollectionId(req.params.versionId)
        if (!id || !versionId) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列和版本ID' })
        }

        const version = await collectionModel.findCollectionVersion(id, versionId)
        if (!version) {
            return res.status(404).json({ code: 404, message: '版本不存在' })
        }

        res.json({ code: 200, message: '查询成功', data: version })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列版本详情查询失败：' + err.message })
    }
}

async function getCollectionVersionDiff(req, res) {
    try {
        if (!canViewCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以查看系列版本' })
        }

        const id = parseCollectionId(req.params.id)
        const versionId = parseCollectionId(req.params.versionId)
        if (!id || !versionId) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列和版本ID' })
        }

        const version = await collectionModel.findCollectionVersion(id, versionId)
        if (!version) {
            return res.status(404).json({ code: 404, message: '版本不存在' })
        }
        const current = await collectionModel.findCollectionById(id)
        if (!current) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: buildCollectionVersionDiff(version, current)
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列版本对比失败：' + err.message })
    }
}

async function restoreCollectionVersion(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以回滚系列版本' })
        }

        const id = parseCollectionId(req.params.id)
        const versionId = parseCollectionId(req.params.versionId)
        if (!id || !versionId) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列和版本ID' })
        }

        const result = await collectionModel.restoreCollectionVersion(id, versionId, {
            userId: req.user.userId
        })
        if (!result.found) {
            return res.status(404).json({
                code: 404,
                message: result.reason === 'version' ? '版本不存在' : '系列不存在'
            })
        }

        const collection = await collectionModel.findCollectionById(id)
        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `回滚内容系列「${collection?.name || id}」到修订 #${result.restoredFrom}（新修订 #${result.revision}）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: '系列已回滚',
            data: {
                collectionId: id,
                revision: result.revision,
                restoredFrom: result.restoredFrom,
                skippedArticleIds: result.skippedArticleIds || []
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列回滚失败：' + err.message })
    }
}

async function cleanupCollectionVersions(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以清理系列版本' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const collection = await collectionModel.findCollectionById(id)
        if (!collection) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        const result = await collectionModel.pruneCollectionVersions(id, {
            retention: collection.versionRetention
        })
        if (!result.found) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `清理内容系列「${collection.name}」版本快照（保留最近 ${result.retention} 版，删除 ${result.deleted} 条）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: result.deleted > 0
                ? `已清理 ${result.deleted} 个旧版本`
                : '没有需要清理的旧版本',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列版本清理失败：' + err.message })
    }
}

async function updateCollectionVersionPolicy(req, res) {
    try {
        if (!canManageCollection(req.user)) {
            return res.status(403).json({ code: 403, message: '仅管理员或编辑可以调整版本保留策略' })
        }

        const id = parseCollectionId(req.params.id)
        if (!id) {
            return res.status(400).json({ code: 400, message: '请传入有效的系列ID' })
        }

        const retention = parseVersionRetention(req.body?.retention)
        if (retention === undefined || retention === null) {
            return res.status(400).json({
                code: 400,
                message: `版本保留数量必须是 1-${collectionModel.MAX_VERSION_RETENTION} 的整数`
            })
        }

        const collection = await collectionModel.findCollectionById(id)
        if (!collection) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        const result = await collectionModel.updateCollectionVersionPolicy(id, retention)
        if (!result.found) {
            return res.status(404).json({ code: 404, message: '系列不存在' })
        }

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'collection',
            targetType: 'collection',
            targetId: id,
            detail: `调整内容系列「${collection.name}」版本保留数量为 ${retention}（清理 ${result.deleted} 条）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: '版本保留策略已保存',
            data: result
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '版本保留策略保存失败：' + err.message })
    }
}

module.exports = {
    getPublicCollections,
    getPublicCollectionById,
    getPublicCollectionsForArticle,
    getCollections,
    getCollectionById,
    createCollection,
    updateCollection,
    deleteCollection,
    setCollectionArticles,
    getCollectionVersions,
    getCollectionVersion,
    getCollectionVersionDiff,
    restoreCollectionVersion,
    cleanupCollectionVersions,
    updateCollectionVersionPolicy
}
