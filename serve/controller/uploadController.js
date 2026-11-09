const crypto = require('node:crypto')
const multer = require('multer')
const imageModel = require('../model/dbModel/image/index')
const fileModel = require('../model/dbModel/file/index')
const subsetModel = require('../model/dbModel/subset/index')
const {
    parseVariantRequest,
    readVariantCache,
    createVariant,
    sendImage,
} = require('../utils/imageVariants')

const maxFileSize = 8 * 1024 * 1024
const mimeExtensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
])

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

/**
 * 把一段图片二进制落库（image 表 + 本地文件聚合行）。
 * 上传与 AI 封面确认共用同一条持久化路径，保证素材库/引用统计口径一致。
 */
async function persistImageBuffer({ buffer, mimetype, userId }) {
    const extension = mimeExtensions.get(mimetype)
    if (!extension) {
        throw Object.assign(new Error('仅支持 JPG、PNG、WebP 和 GIF 图片'), { status: 415 })
    }

    const filename = createFilename(extension)
    const checksum = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex')

    const { imageId } = await imageModel.createImage({
        filename,
        mimeType: mimetype,
        size: buffer.length,
        checksum,
        data: buffer,
        userId: userId ?? null
    })

    // 同步登记到「本地文件」：内容图片与磁盘文件在同一个列表里可见，
    // file 行只存展示元数据，二进制本体仍在 image 表。
    try {
        let subsetId = null
        try {
            // 内容图片归入「内容图片」分组，与磁盘文件区分开
            subsetId = await subsetModel.ensureResourceSubset('内容图片', 95)
        } catch (subsetErr) {
            // 找不到资源分组时先归入未分类，不影响图片本身。
            console.warn('[Upload] 查询图片分组失败，归入未分类：', subsetErr.message)
        }

        await fileModel.insertImageBinding({
            fileName: filename,
            format: extension.replace(/^\./, ''),
            size: buffer.length,
            sourceImageId: imageId,
            subsetId
        })
    } catch (bindErr) {
        // 聚合登记失败不影响图片本身可用，只记录日志。
        console.warn('[Upload] 登记到本地文件失败：', bindErr.message)
    }

    return { filename, url: `/api/uploads/${filename}` }
}

async function saveImage(req, res, file) {
    try {
        const { url } = await persistImageBuffer({
            buffer: file.buffer,
            mimetype: file.mimetype,
            userId: req.user?.userId
        })
        return res.status(200).json({
            code: 200,
            message: '上传成功',
            data: { url }
        })
    } catch (err) {
        console.error('[Upload] 保存图片失败：', err)
        const status = err?.status || 500
        const message = status === 415 ? err.message : '图片保存失败，请稍后重试'
        return sendUploadError(res, status, message)
    }
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

    const variantRequest = parseVariantRequest(req.query)
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
                {
                    version: cached.version,
                    data: cached.data,
                    mimeType: 'image/webp',
                    width: variantRequest.width
                }
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
        return sendImage(req, res, {
            version: image.checksum || `${image.filename}-${image.size}`,
            data: image.data,
            mimeType: image.mime_type,
        })
    }

    try {
        const version = image.checksum || `${image.filename}-${image.size}`
        const variant = await createVariant(image.data, variantRequest.width, cacheKey, version)
        return sendImage(req, res, {
            version,
            data: variant.data,
            mimeType: 'image/webp',
            width: variantRequest.width,
        })
    } catch (error) {
        // 缩略图生成失败时仍返回原图，优先保证内容可读。
        console.error(`[Upload] 生成缩略图失败（${filename}）：`, error)
        return sendImage(req, res, {
            version: image.checksum || `${image.filename}-${image.size}`,
            data: image.data,
            mimeType: image.mime_type,
        })
    }
}

module.exports = { uploadImage, getImage, persistImageBuffer }
