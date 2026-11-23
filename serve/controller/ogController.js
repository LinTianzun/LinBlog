const articleModel = require('../model/dbModel/article/index')
const diaryModel = require('../model/dbModel/diary/index')
const collectionModel = require('../model/dbModel/collection/index')
const noteModel = require('../model/dbModel/note/index')
const { logger } = require('../utils/logger.js')
const { renderOgImage } = require('../utils/ogImage')
const { resolveOrigin } = require('./seoController')
const {
    homeMeta,
    contentMeta,
    metaEtag,
} = require('../utils/portalMeta')

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400'
const IMAGE_CACHE_MAX = 96
const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000
const imageCache = new Map()

function parseId(value) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

async function loadMeta(kind, id, origin) {
    if (kind === 'home') return homeMeta(origin)

    if (kind === 'article' || kind === 'gallery') {
        const article = await articleModel.findAtricleById(id, null, 'guest')
        if (!article) return null
        const actualKind = article.classify === 'image' ? 'gallery' : 'article'
        return contentMeta(actualKind, article, origin)
    }

    if (kind === 'diary') {
        const diary = await diaryModel.findPublicDiaryById(id)
        return contentMeta('diary', diary, origin)
    }

    if (kind === 'series') {
        const collection = await collectionModel.findCollectionById(id, { publicOnly: true })
        if (!collection || Number(collection.publishedCount) <= 0) return null
        return contentMeta('series', collection, origin)
    }

    if (kind === 'note') {
        const note = await noteModel.findPublicNoteById(id)
        return contentMeta('note', note, origin)
    }

    return null
}

function rememberImage(key, image) {
    const now = Date.now()
    if (imageCache.size >= IMAGE_CACHE_MAX) {
        const oldest = imageCache.keys().next().value
        if (oldest) imageCache.delete(oldest)
    }
    imageCache.set(key, { at: now, image })
}

async function buildImage(meta) {
    if (!meta) {
        return {
            image: await renderOgImage({}),
            etag: '"og-fallback"',
        }
    }

    const etag = metaEtag(meta)
    const cached = imageCache.get(etag)
    if (cached && Date.now() - cached.at < IMAGE_CACHE_TTL) {
        return { image: cached.image, etag }
    }

    const image = await renderOgImage({
        title: meta.title,
        description: meta.description,
        kind: meta.imageKind,
        themeKey: meta.ogThemeKey,
        date: meta.modifiedTime || meta.publishedTime,
        url: meta.url,
    })
    rememberImage(etag, image)
    return { image, etag }
}

function sendImage(res, image, etag) {
    res.set('Cache-Control', CACHE_CONTROL)
    res.set('ETag', etag)
    res.type('image/png').send(image)
}

function createImageHandler(kind) {
    return async (req, res) => {
        const id = kind === 'home' ? null : parseId(req.params.id)
        if (kind !== 'home' && !id) {
            return res.status(404).type('text/plain').send('Not Found')
        }

        try {
            const meta = await loadMeta(kind, id, resolveOrigin(req))
            if (!meta) {
                const fallback = await buildImage(null)
                if (matchEtag(req, fallback.etag)) return notModified(res, fallback.etag)
                return sendImage(res, fallback.image, fallback.etag)
            }

            const etag = metaEtag(meta)
            if (matchEtag(req, etag)) return notModified(res, etag)
            const rendered = await buildImage(meta)
            return sendImage(res, rendered.image, rendered.etag)
        } catch (err) {
            logger.warn('[OG] 图片生成失败', null, err)
            try {
                const fallback = await buildImage(null)
                return sendImage(res, fallback.image, fallback.etag)
            } catch (fallbackError) {
                logger.error('[OG] 默认图片生成失败', null, fallbackError)
                return res.status(500).type('text/plain').send('OG image unavailable')
            }
        }
    }
}

function matchEtag(req, etag) {
    const header = req.get('if-none-match')
    if (!header) return false
    if (header.trim() === '*') return true
    return header.split(',').some(value => value.trim().replace(/^W\//, '') === etag)
}

function notModified(res, etag) {
    res.set('Cache-Control', CACHE_CONTROL)
    res.set('ETag', etag)
    return res.status(304).end()
}

function clearImageCache() {
    imageCache.clear()
}

module.exports = {
    getHomeImage: createImageHandler('home'),
    getArticleImage: createImageHandler('article'),
    getGalleryImage: createImageHandler('gallery'),
    getDiaryImage: createImageHandler('diary'),
    getSeriesImage: createImageHandler('series'),
    getNoteImage: createImageHandler('note'),
    loadMeta,
    buildImage,
    clearImageCache,
}
