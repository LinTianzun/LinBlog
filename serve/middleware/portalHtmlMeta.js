const fs = require('node:fs')
const { applyFrontendSecurityPolicy } = require('./frontendCsp')
const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')
const collectionModel = require('../model/dbModel/collection/index')
const noteModel = require('../model/dbModel/note/index')
const { logger } = require('../utils/logger.js')
const { resolveOrigin } = require('../controller/seoController')
const {
    parseMetaTarget,
    homeMeta,
    archiveMeta,
    contentMeta,
    injectPortalMeta,
} = require('../utils/portalMeta')

async function resolvePortalMeta(target, origin) {
    if (!target) return null
    if (target.kind === 'home') return homeMeta(origin)
    if (!target.id) return archiveMeta(target.kind, origin)

    if (target.kind === 'article' || target.kind === 'gallery') {
        const article = await articleModel.findAtricleById(target.id, null, 'guest')
        if (!article) return null
        const actualKind = article.classify === 'image' ? 'gallery' : 'article'
        return contentMeta(actualKind, article, origin)
    }
    if (target.kind === 'diary') {
        return contentMeta('diary', await diaryModel.findPublicDiaryById(target.id), origin)
    }
    if (target.kind === 'series') {
        const collection = await collectionModel.findCollectionById(target.id, { publicOnly: true })
        if (!collection || Number(collection.publishedCount) <= 0) return null
        return contentMeta('series', collection, origin)
    }
    if (target.kind === 'note') {
        return contentMeta('note', await noteModel.findPublicNoteById(target.id), origin)
    }
    return null
}

/**
 * SPA 详情页的分享预览：社交爬虫不执行前端脚本，
 * 所以在返回 index.html 前由服务端补上标题、摘要、分享图与结构化数据。
 */
function createPortalHtmlMeta(indexFile) {
    let cachedHtml = ''

    return async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const target = parseMetaTarget(req.path, req.originalUrl?.split('?')[1] || '')
        if (!target) return next()

        let html = ''
        try {
            if (!cachedHtml) cachedHtml = fs.readFileSync(indexFile, 'utf8')
            html = cachedHtml
        } catch (err) {
            return next(err)
        }

        let meta = null
        try {
            meta = await resolvePortalMeta(target, resolveOrigin(req))
        } catch (err) {
            logger.warn('[PortalMeta] 读取公开内容失败，回退默认页面', null, err)
        }

        applyFrontendSecurityPolicy(res)
        res.setHeader('Cache-Control', 'no-cache')
        // 公开内容缺失（草稿、已删除）与首页都返回同一份 SPA，由前端展示 404/归档。
        res.type('html').send(req.method === 'HEAD' ? '' : injectPortalMeta(html, meta))
    }
}

module.exports = {
    createPortalHtmlMeta,
    resolvePortalMeta,
}
