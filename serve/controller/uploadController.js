const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const multer = require('multer')

const uploadDir = path.join(__dirname, '..', 'data', 'img')
const maxFileSize = 8 * 1024 * 1024
const mimeExtensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
])

fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadDir)
    },
    filename: (_req, file, callback) => {
        const extension = mimeExtensions.get(file.mimetype) || ''
        callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`)
    }
})

const upload = multer({
    storage,
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

function uploadImage(req, res) {
    upload(req, res, (error) => {
        if (error) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return sendUploadError(res, 413, '图片大小不能超过 8MB')
            }

            return sendUploadError(res, error.status || 400, error.message || '图片上传失败')
        }

        if (!req.file) {
            return sendUploadError(res, 400, '请选择要上传的图片')
        }

        return res.status(200).json({
            code: 200,
            message: '上传成功',
            data: {
                url: `/api/uploads/${req.file.filename}`
            }
        })
    })
}

module.exports = { uploadImage }
