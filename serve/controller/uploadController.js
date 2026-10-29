const crypto = require('node:crypto')
const multer = require('multer')
const sharp = require('sharp')
const imageModel = require('../model/dbModel/image/index')

const maxFileSize = 8 * 1024 * 1024
const mimeExtensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
])
const variantWidths = new Set([160, 240, 320, 480, 640, 720, 960, 1280, 1600])
const variantCache = new Map()
const pendingVariants = new Map()
const variantCacheMaxBytes = 64 * 1024 * 1024
let variantCacheBytes = 0

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: maxFileSize,
        files: 1
    },
    fileFilter: (_req, file, callback) => {
        if (mimeExtensions.has(file.mimetype)) {
            callback(null, true)
            return
        }

        const error = new Error('仅支持 JPG、PNG、WebP 和 GIF 图片')
        error.status = 415
        callback(error)
    }
}).single('file')

function sendUploadError(res, code, message) {
    // yk-upload 仅处理 HTTP 200，失败信息通过 error 字段反馈。
    return res.status(200).json({
        code,
        error: message,
        message
    })
}

function createFilename(extension) {
    return `${Date.now()}-${crypto.randomUUID()}${extension}`
}

function getVariantRequest(req) {
    const rawWidth = Array.isArray(req.query?.w) ? req.query.w[0] : req.query?.w
    if (rawWidth === undefined || rawWidth === '') return null

    const width = Number(rawWidth)
    const format = Array.isArray(req.query?.format) ? req.query.format[0] : req.query?.format
    if (!Number.isInteger(width) || !variantWidths.has(width) || (format && format !== 'webp')) {
        return { invalid: true }
    }

    return { width, format: 'webp' }
}

function readVariantCache(key) {
    const cached = variantCache.get(key)
    if (!cached) return null

    // Map 保持插入顺序，命中后移到队尾即可实现轻量 LRU。
    variantCache.delete(key)
    variantCache.set(key, cached)
    return cached
}

function writeVariantCache(key, value) {
    const dataLength = value.data.length
    if (dataLength > variantCacheMaxBytes) return

    const previous = variantCache.get(key)
    if (previous) {
        variantCacheBytes -= previous.data.length
        variantCache.delete(key)
    }

    while (variantCache.size && variantCacheBytes + dataLength > variantCacheMaxBytes) {
        const oldestKey = variantCache.keys().next().value
        const oldest = variantCache.get(oldestKey)
        variantCache.delete(oldestKey)
        variantCacheBytes -= oldest?.data.length || 0
    }

    variantCache.set(key, value)
    variantCacheBytes += dataLength
}

function createVariant(image, width, cacheKey) {
    const pending = pendingVariants.get(cacheKey)
    if (pending) return pending

    const quality = width <= 320 ? 72 : width <= 640 ? 76 : 80
    const task = sharp(image.data, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
        animated: false
    })
        .rotate()
        .resize({
            width,
            fit: 'inside',
            withoutEnlargement: true,
            fastShrinkOnLoad: true
        })
        .webp({ quality, effort: 4, smartSubsample: true })
        .toBuffer()
        .then((data) => {
            const variant = {
                data,
                version: image.checksum || `${image.filename}-${image.size}`
            }
            writeVariantCache(cacheKey, variant)
            return variant
        })
        .finally(() => {
            pendingVariants.delete(cacheKey)
        })

    pendingVariants.set(cacheKey, task)
    return task
}

function createEtag(image, width) {
    const version = image.checksum || `${image.filename}-${image.size}`
    return `"${version}-${width || 'original'}"`
}

function sendImage(req, res, image, data, mimeType, width) {
    const etag = createEtag(image, width)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('ETag', etag)

    const requestEtag = req.headers?.['if-none-match']
    if (requestEtag && requestEtag === etag) {
        res.statusCode = 304
        return res.end()
    }

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Length', data.length)
    return res.end(data)
}

async function saveImage(req, res, file) {
    const extension = mimeExtensions.get(file.mimetype)
    const filename = createFilename(extension)
    const checksum = crypto
        .createHash('sha256')
        .update(file.buffer)
        .digest('hex')

    try {
        await imageModel.createImage({
            filename,
            mimeType: file.mimetype,
            size: file.size,
            checksum,
            data: file.buffer,
            userId: req.user?.userId ?? null
        })
    } catch (err) {
        console.error('[Upload] 保存图片失败：', err)
        return sendUploadError(res, 500, '图片保存失败，请稍后重试')
    }

    return res.status(200).json({
        code: 200,
        message: '上传成功',
        data: {
            url: `/api/uploads/${filename}`
        }
    })
}

function uploadImage(req, res) {
    upload(req, res, async (error) => {
        if (error) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return sendUploadError(res, 413, '图片大小不能超过 8MB')
            }

            return sendUploadError(res, error.status || 400, error.message || '图片上传失败')
        }

        if (!req.file) {
            return sendUploadError(res, 400, '请选择要上传的图片')
        }

        await saveImage(req, res, req.file)
    })
}

async function getImage(req, res) {
    const filename = String(req.params.filename || '').trim()

    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
        return res.status(400).json({ code: 400, message: '图片名称不合法' })
    }

    const variantRequest = getVariantRequest(req)
    if (variantRequest?.invalid) {
        return res.status(400).json({ code: 400, message: '缩略图尺寸不受支持' })
    }

    const cacheKey = variantRequest ? `${filename}:${variantRequest.width}:${variantRequest.format}` : ''
    if (cacheKey) {
        const cached = readVariantCache(cacheKey)
        if (cached) {
            return sendImage(
                req,
                res,
                { filename, checksum: cached.version },
                cached.data,
                'image/webp',
                variantRequest.width
            )
        }
    }

    let rows
    try {
        rows = await imageModel.findActiveImageByFilename(filename)
    } catch (err) {
        console.error('[Upload] 查询图片失败：', err)
        return res.status(503).json({ code: 503, message: '图片服务暂时不可用' })
    }

    const image = rows?.[0]
    if (!image) {
        return res.status(404).json({ code: 404, message: '图片不存在' })
    }

    if (!variantRequest) {
        return sendImage(req, res, image, image.data, image.mime_type)
    }

    try {
        const variant = await createVariant(image, variantRequest.width, cacheKey)
        return sendImage(req, res, image, variant.data, 'image/webp', variantRequest.width)
    } catch (error) {
        // 缩略图生成失败时仍返回原图，优先保证内容可读。
        console.error(`[Upload] 生成缩略图失败（${filename}）：`, error)
        return sendImage(req, res, image, image.data, image.mime_type)
    }
}

module.exports = { uploadImage, getImage }
