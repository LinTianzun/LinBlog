const collectionModel = require('../model/dbModel/collection/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')

const MAX_ARTICLES = 200

function canManageCollection(user) {
    return hasPermission(user, 'category.manage')
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
        if (!canManageCollection(req.user)) {
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
        if (!canManageCollection(req.user)) {
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

        const result = await collectionModel.insertCollection({
            name,
            description,
            cover,
            sort: normalizeSort(req.body?.sort)
        })

        writeSystemLog({
            userId: req.user.userId,
            action: 'create',
            module: 'article',
            targetType: 'collection',
            targetId: result.collectionId,
            detail: `创建内容系列「${name}」`,
            ip: req.ip || null
        })

        res.status(201).json({
            code: 200,
            message: '系列创建成功',
            data: { collectionId: result.collectionId }
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

        await collectionModel.updateCollection(id, {
            name,
            description: normalizeText(req.body?.description, 500),
            cover: normalizeText(req.body?.cover, 255),
            sort: req.body?.sort === undefined ? undefined : normalizeSort(req.body.sort)
        })

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'article',
            targetType: 'collection',
            targetId: id,
            detail: `更新内容系列「${name || current.name}」`,
            ip: req.ip || null
        })

        res.json({ code: 200, message: '系列更新成功' })
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
            module: 'article',
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

        const savedCount = await collectionModel.replaceCollectionArticles(id, articleIds)

        writeSystemLog({
            userId: req.user.userId,
            action: 'update',
            module: 'article',
            targetType: 'collection',
            targetId: id,
            detail: `调整内容系列「${current.name}」文章顺序（${savedCount} 篇）`,
            ip: req.ip || null
        })

        res.json({
            code: 200,
            message: '系列文章保存成功',
            data: { collectionId: id, articleCount: savedCount }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '系列文章保存失败：' + err.message })
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
    setCollectionArticles
}
