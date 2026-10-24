const crypto = require('node:crypto')
const multer = require('multer')
const imageModel = require('../model/dbModel/image/index')

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

    res.setHeader('Content-Type', image.mime_type)
    res.setHeader('Content-Length', image.size)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.end(image.data)
}

module.exports = { uploadImage, getImage }
