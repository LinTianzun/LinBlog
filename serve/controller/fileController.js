const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const multer = require('multer')
const fileModel = require('../model/dbModel/file/index')
const subsetModel = require('../model/dbModel/subset/index')
const { writeSystemLog } = require('../utils/logHelper')
const { formatPaginationParams } = require('../utils/paginationUtil')

const uploadDir = path.join(__dirname, '..', 'data', 'files')
const maxFileSize = 20 * 1024 * 1024

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
}

// 文件落盘命名：时间戳-UUID+原扩展名，避免重名覆盖
const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')
        callback(null, `${Date.now()}-${crypto.randomUUID()}${ext}`)
    }
})

// yk-upload 使用 FormData 且字段名为 file
const upload = multer({ storage, limits: { fileSize: maxFileSize, files: 1 } }).single('file')

const mimeMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', pdf: 'application/pdf',
    txt: 'text/plain', mp4: 'video/mp4', mp3: 'audio/mpeg'
}

function sendUploadError(res, code, message) {
    // yk-upload 只处理 HTTP 200，失败信息通过 error 字段反馈
    return res.status(200).json({ code, error: message, message })
}

function normalizeIdList(value) {
    const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
    return [...new Set(raw
        .map(item => Number(item))
        .filter(item => Number.isSafeInteger(item) && item > 0))]
}

// file.url 存磁盘文件名；演示数据可能是远程地址，这里统一转成可访问路径
function toAccessUrl(id, url) {
    const value = String(url || '')
    if (/^https?:\/\//i.test(value)) return value
    return `/api/file/${id}/download`
}

function formatFile(item) {
    return {
        id: item.id,
        fileName: item.file_name,
        format: item.format,
        size: item.size,
        url: toAccessUrl(item.id, item.url),
        subsetId: item.subset_id,
        createdAt: item.created_at
    }
}

/**
 * 文件分页列表（支持分组、未分类、文件名关键词筛选）
 */
async function getFiles(req, res) {
    try {
        const params = formatPaginationParams(req.query, {
            defaultPageSize: 8,
            maxPageSize: 50
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
        const subsetId = Number(req.query.subsetId)

        const { list, total } = await fileModel.getFilesByPage({
            subsetId: Number.isSafeInteger(subsetId) && subsetId > 0 ? subsetId : undefined,
            uncategorized: req.query.uncategorized === 'true',
            keyword: keyword || undefined,
            pageSize,
            offset
        })

        res.json({
            code: 200,
            message: '获取文件列表成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map(formatFile)
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取文件列表失败：' + err.message })
    }
}

/**
 * 分组栏统计：文件总数、未分类数、各分组文件数
 */
async function getFileSummary(req, res) {
    try {
        const [summary, subsets] = await Promise.all([
            fileModel.countFilesSummary(),
            fileModel.getSubsetCounts()
        ])

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                all: summary.total,
                uncategorized: summary.uncategorized,
                subsets
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件统计查询失败：' + err.message })
    }
}

/**
 * 上传文件（落盘 + 写入 file 表）
 */
async function uploadFile(req, res) {
    upload(req, res, async (error) => {
        if (error) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return sendUploadError(res, 413, '文件大小不能超过 20MB')
            }
            return sendUploadError(res, error.status || 400, error.message || '文件上传失败')
        }

        if (!req.file) {
            return sendUploadError(res, 400, '请选择要上传的文件')
        }

        try {
            const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
            const ext = path.extname(originalName).toLowerCase().replace(/^\./, '')
            const subsetIdParam = Number(req.query.subsetId ?? req.body.subsetId)
            let subsetId = null

            if (Number.isSafeInteger(subsetIdParam) && subsetIdParam > 0) {
                const subset = await subsetModel.findSubsetById(subsetIdParam)
                if (!subset || Number(subset.status) !== 1) {
                    fs.unlink(req.file.path, () => {})
                    return sendUploadError(res, 400, '所属分组不存在')
                }
                subsetId = subset.id
            }

            const { fileId } = await fileModel.insertFile({
                fileName: originalName.slice(0, 100),
                format: (ext || 'file').slice(0, 32),
                size: req.file.size,
                url: req.file.filename,
                subsetId
            })

            // yk-upload 只处理 HTTP 200，成功也必须用 200 返回
            writeSystemLog({
                userId: req.user?.userId ?? null,
                action: 'create',
                module: 'file',
                targetType: 'file',
                targetId: fileId,
                detail: `上传文件「${originalName}」`,
                ip: req.ip || null,
            })

            res.status(200).json({
                code: 200,
                message: '上传成功',
                data: {
                    fileId,
                    url: `/api/file/${fileId}/download`,
                    fileName: originalName,
                    format: (ext || 'file').slice(0, 32),
                    size: req.file.size
                }
            })
        } catch (err) {
            console.error('[Upload] 保存文件记录失败：', err)
            fs.unlink(req.file.path, () => {})
            return sendUploadError(res, 500, '文件保存失败，请稍后重试')
        }
    })
}

/**
 * 下载/预览文件：本地文件读盘流式返回，远程地址直接 302
 */
async function downloadFile(req, res) {
    try {
        const fileId = Number(req.params.id)
        if (!Number.isSafeInteger(fileId) || fileId <= 0) {
            return res.status(400).json({ code: 400, message: '文件ID必须是有效数字' })
        }

        const file = await fileModel.findFileById(fileId)
        if (!file || Number(file.status) !== 1) {
            return res.status(404).json({ code: 404, message: '文件不存在或已删除' })
        }

        if (/^https?:\/\//i.test(String(file.url))) {
            return res.redirect(302, file.url)
        }

        // 仅取 basename，防止路径穿越
        const diskName = path.basename(String(file.url))
        const filePath = path.join(uploadDir, diskName)
        if (!diskName || !fs.existsSync(filePath)) {
            return res.status(404).json({ code: 404, message: '文件内容已丢失' })
        }

        const inline = req.query.inline === 'true'
        const mime = mimeMap[String(file.format || '').toLowerCase()]
        res.setHeader('Content-Type', inline && mime ? mime : 'application/octet-stream')
        res.setHeader(
            'Content-Disposition',
            `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
        )
        fs.createReadStream(filePath).pipe(res)
    } catch (err) {
        console.error('[File] 下载失败：', err)
        if (!res.headersSent) {
            res.status(500).json({ code: 500, message: '文件下载失败' })
        }
    }
}

/**
 * 批量移动文件到指定分组（subsetId 为空表示移入未分类）
 */
async function moveFiles(req, res) {
    try {
        const ids = normalizeIdList(req.body.fileIds)
        if (ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请选择要移动的文件' })
        }

        const subsetIdParam = req.body.subsetId
        let subsetId = null

        if (subsetIdParam !== undefined && subsetIdParam !== null && subsetIdParam !== '') {
            const parsed = Number(subsetIdParam)
            if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                return res.status(400).json({ code: 400, message: '分组ID无效' })
            }
            const subset = await subsetModel.findSubsetById(parsed)
            if (!subset || Number(subset.status) !== 1) {
                return res.status(400).json({ code: 400, message: '目标分组不存在' })
            }
            subsetId = subset.id
        }

        const existing = await fileModel.findExistingFileIds(ids)
        if (existing.length !== ids.length) {
            return res.status(404).json({ code: 404, message: '部分文件不存在或已删除' })
        }

        for (const id of existing) {
            await fileModel.updateFileSubset(id, subsetId)
        }

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'update',
            module: 'file',
            targetType: 'file',
            targetId: null,
            detail: `移动 ${existing.length} 个文件到${subsetId ? `分组 ${subsetId}` : '未分类'}`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: subsetId ? '移动成功' : '已移入未分类',
            data: { movedCount: existing.length }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件移动失败：' + err.message })
    }
}

/**
 * 批量删除文件（逻辑删除，磁盘文件保留以便恢复）
 */
async function deleteFiles(req, res) {
    try {
        const ids = normalizeIdList(req.body.fileIds ?? req.params.id)
        if (ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请选择要删除的文件' })
        }

        const deleted = await fileModel.softDeleteFiles(ids)
        if (deleted === 0) {
            return res.status(404).json({ code: 404, message: '文件不存在或已删除' })
        }

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'delete',
            module: 'file',
            targetType: 'file',
            targetId: null,
            detail: `删除 ${deleted} 个文件`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '删除成功', data: { deletedCount: deleted } })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件删除失败：' + err.message })
    }
}

module.exports = {
    getFiles,
    getFileSummary,
    uploadFile,
    downloadFile,
    moveFiles,
    deleteFiles
}
