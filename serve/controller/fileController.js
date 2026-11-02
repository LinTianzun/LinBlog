const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const multer = require('multer')
const fileModel = require('../model/dbModel/file/index')
const imageModel = require('../model/dbModel/image/index')
const subsetModel = require('../model/dbModel/subset/index')
const { writeSystemLog } = require('../utils/logHelper')
const { hasPermission } = require('../utils/accessControl')
const { formatPaginationParams } = require('../utils/paginationUtil')
const fileStorage = require('../utils/fileStorage')
const { runFileLifecycleCleanup } = require('../utils/fileLifecycle')
const offsiteStorage = require('../utils/fileOffsite').defaultOffsite
const { getBackupCapacity } = require('../utils/fileCapacity')
const {
    parseVariantRequest,
    readVariantCache,
    createVariant,
    sendImage,
    variantCacheInfo,
    clearVariantCache,
} = require('../utils/imageVariants')

const uploadDir = fileStorage.activeDir
const maxFileSize = 20 * 1024 * 1024

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
    // 内容图片（文章/图库/随笔上传）没有磁盘副本，
    // 直接复用 /api/uploads 地址展示与下载。
    if (item.source_image_id) {
        return {
            id: item.id,
            fileName: item.file_name,
            format: item.format,
            size: item.size,
            url: `/api/uploads/${item.file_name}`,
            rawUrl: `/api/file/${item.id}/raw`,
            subsetId: item.subset_id,
            createdAt: item.created_at,
            source: 'image',
            owners: item.owners || []
        }
    }

    return {
        id: item.id,
        fileName: item.file_name,
        format: item.format,
        size: item.size,
        url: toAccessUrl(item.id, item.url),
        subsetId: item.subset_id,
        createdAt: item.created_at,
        source: 'file'
    }
}

// 素材库选择器只关心图片；raw 地址可被文章/图库/随笔直接引用，
// 并与 /api/uploads 一样支持 ?w=&format=webp 响应式缩略图。
function formatImageFile(item) {
    const rawUrl = `/api/file/${item.id}/raw`
    const params = new URLSearchParams({ w: '320', format: 'webp' })
    return {
        id: item.id,
        fileName: item.file_name,
        format: item.format,
        size: item.size,
        url: rawUrl,
        thumbUrl: `${rawUrl}?${params.toString()}`,
        subsetId: item.subset_id,
        subsetName: item.subsetName || null,
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

        // 内容图片要展示被哪篇文章、图库或随笔引用，一次批量查完再挂到条目上
        const imageFileIds = list
            .filter(item => item.source_image_id)
            .map(item => item.id)
        let owners = []
        if (imageFileIds.length > 0) {
            try {
                owners = await fileModel.findContentOwnersByFileIds(imageFileIds)
            } catch (err) {
                // 归属查询失败不影响列表本身，只是不展示引用来源
                console.warn('[File] 查询内容图片归属失败：', err.message)
            }
        }
        const ownersByFile = new Map()
        for (const owner of owners) {
            const listForFile = ownersByFile.get(owner.fileId) || []
            listForFile.push({
                type: owner.type,
                id: owner.id,
                title: owner.title
            })
            ownersByFile.set(owner.fileId, listForFile)
        }

        res.json({
            code: 200,
            message: '获取文件列表成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map((item) => {
                    const formatted = formatFile(item)
                    if (formatted.owners) {
                        formatted.owners = ownersByFile.get(item.id) || []
                    }
                    return formatted
                })
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
 * 素材库图片分页列表：从本地文件模块筛选可内联展示的图片。
 */
async function getImageFiles(req, res) {
    try {
        const params = formatPaginationParams(req.query, {
            defaultPageSize: 12,
            maxPageSize: 50
        })
        if (!params.success) {
            return res.status(400).json({ code: 400, message: params.errorMsg })
        }

        const { page, pageSize, offset } = params.data
        const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
        const { list, total } = await fileModel.getImageFilesByPage({
            keyword: keyword || undefined,
            pageSize,
            offset
        })

        res.json({
            code: 200,
            message: '获取素材图片列表成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: list.map(formatImageFile)
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取素材图片列表失败：' + err.message })
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

        // 内容图片没有磁盘副本，直接把 image 表里的二进制作为附件下载。
        if (file.source_image_id) {
            const image = await imageModel.findImageById(file.source_image_id)
            if (!image || Number(image.status) !== 1) {
                return res.status(404).json({ code: 404, message: '文件内容已丢失' })
            }

            res.setHeader('Content-Type', image.mime_type || 'application/octet-stream')
            res.setHeader(
                'Content-Disposition',
                `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
            )
            return res.end(image.data)
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
 * 本地图片的公开内联地址：与 /api/uploads/:filename 保持同一缩略图契约。
 * 文章、图库和随笔引用 raw 地址后，回收站清除前会先检查内容引用。
 */
async function getRawImage(req, res) {
    try {
        const fileId = Number(req.params.id)
        if (!Number.isSafeInteger(fileId) || fileId <= 0) {
            return res.status(400).json({ code: 400, message: '文件ID必须是有效数字' })
        }

        const variantRequest = parseVariantRequest(req.query)
        if (variantRequest?.invalid) {
            return res.status(400).json({ code: 400, message: '缩略图尺寸不受支持' })
        }

        const file = await fileModel.findFileById(fileId)
        if (!file || Number(file.status) !== 1) {
            return res.status(404).json({ code: 404, message: '图片不存在或已删除' })
        }

        // 内容图片存在 image 表里，没有磁盘副本，直接读二进制并走同一缩略图契约。
        if (file.source_image_id) {
            return sendDatabaseImage(req, res, file.source_image_id, variantRequest)
        }

        if (/^https?:\/\//i.test(String(file.url))) {
            return res.redirect(302, file.url)
        }

        const format = String(file.format || '').toLowerCase()
        const mimeType = mimeMap[format]
        if (!mimeType || !mimeType.startsWith('image/')) {
            return res.status(415).json({ code: 415, message: '该文件不是可内联展示的图片' })
        }

        const diskName = path.basename(String(file.url))
        const filePath = path.join(uploadDir, diskName)
        if (!diskName || !fs.existsSync(filePath)) {
            return res.status(404).json({ code: 404, message: '图片内容已丢失' })
        }

        // SVG 是用户上传的矢量文件，内联服务时禁用脚本与外链资源。
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
        const stat = fs.statSync(filePath)
        const version = `${file.id}-${stat.size}-${Math.floor(stat.mtimeMs)}`

        if (!variantRequest || mimeType === 'image/svg+xml') {
            if (variantRequest) {
                return res.redirect(
                    302,
                    `/api/file/${fileId}/raw`
                )
            }

            const data = fs.readFileSync(filePath)
            return sendImage(req, res, { version, data, mimeType })
        }

        const cacheKey = `${fileId}:${variantRequest.width}:${variantRequest.format}`
        const cached = readVariantCache(cacheKey)
        if (cached) {
            return sendImage(req, res, {
                version: cached.version,
                data: cached.data,
                mimeType: 'image/webp',
                width: variantRequest.width
            })
        }

        try {
            const variant = await createVariant(filePath, variantRequest.width, cacheKey, version)
            return sendImage(req, res, {
                version,
                data: variant.data,
                mimeType: 'image/webp',
                width: variantRequest.width
            })
        } catch (err) {
            console.error(`[File] 生成缩略图失败（${file.file_name}）：`, err)
            const data = fs.readFileSync(filePath)
            return sendImage(req, res, { version, data, mimeType })
        }
    } catch (err) {
        console.error('[File] 读取图片失败：', err)
        if (!res.headersSent) {
            res.status(500).json({ code: 500, message: '图片读取失败' })
        }
    }
}

/**
 * 读取 image 表里的图片并返回（与 /api/uploads/:filename 同契约）。
 */
async function sendDatabaseImage(req, res, imageId, variantRequest) {
    const image = await imageModel.findImageById(imageId)
    if (!image || Number(image.status) !== 1) {
        return res.status(404).json({ code: 404, message: '图片不存在或已删除' })
    }

    const version = image.checksum || `${image.filename}-${image.size}`
    if (!variantRequest) {
        return sendImage(req, res, {
            version,
            data: image.data,
            mimeType: image.mime_type
        })
    }

    const cacheKey = `image:${image.id}:${variantRequest.width}:${variantRequest.format}`
    const cached = readVariantCache(cacheKey)
    if (cached) {
        return sendImage(req, res, {
            version: cached.version,
            data: cached.data,
            mimeType: 'image/webp',
            width: variantRequest.width
        })
    }

    try {
        const variant = await createVariant(image.data, variantRequest.width, cacheKey, version)
        return sendImage(req, res, {
            version,
            data: variant.data,
            mimeType: 'image/webp',
            width: variantRequest.width
        })
    } catch (err) {
        console.error(`[File] 生成内容图片缩略图失败（${image.filename}）：`, err)
        return sendImage(req, res, {
            version,
            data: image.data,
            mimeType: image.mime_type
        })
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
 * 批量删除文件（逻辑删除并把本地文件移入非公开备份区）
 */
async function deleteFiles(req, res) {
    try {
        const ids = normalizeIdList(req.body.fileIds ?? req.params.id)
        if (ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请选择要删除的文件' })
        }

        const existing = await fileModel.findFilesByIds(ids)
        const activeFiles = existing.filter(file => Number(file.status) === 1)
        // 被内容引用的图片不能直接删除：文章封面/正文、随笔图片都指向 raw 地址，
        // 文件一旦移入备份区，线上内容就会出现裂图。
        const referenced = []
        const deletableIds = []
        for (const file of activeFiles) {
            // 内容图片按文件名统计引用（内容里用的是 /api/uploads/:filename），
            // 磁盘文件按 /api/file/:id/raw 精确匹配。
            const referenceCount = file.source_image_id
                ? await imageModel.countImageReferencesWithBinding(file.file_name)
                : await fileModel.countFileReferences(file.id)
            if (referenceCount > 0) {
                referenced.push({ id: file.id, referenceCount })
                continue
            }
            deletableIds.push(file.id)
        }

        const deleted = await fileModel.softDeleteFiles(deletableIds)
        if (deleted === 0) {
            if (referenced.length > 0) {
                return res.status(409).json({
                    code: 409,
                    message: '部分文件仍被内容引用，请先移除引用再删除',
                    data: { referenced }
                })
            }
            return res.status(404).json({ code: 404, message: '文件不存在或已删除' })
        }

        let backedUpCount = 0
        let backupFailedCount = 0
        let offsiteFailedCount = 0
        for (const file of activeFiles) {
            // 仍被内容引用的文件不会进 deletableIds，图片本体必须保持可用。
            if (!deletableIds.includes(file.id)) continue

            // 内容图片本体在 image 表里，没有磁盘文件需要搬进备份区。
            if (file.source_image_id) {
                await imageModel.deactivateImageById(file.source_image_id)
                continue
            }

            if (fileStorage.isRemoteUrl(file.url)) continue
            try {
                const result = await fileStorage.moveToBackup(file.url)
                if (result.moved || result.reason === 'already_backed_up') {
                    backedUpCount += 1
                    const synced = await offsiteStorage.syncFromBackup(file.url)
                    offsiteFailedCount += synced.failed.length
                    if (synced.failed.length > 0) {
                        console.warn(`[File] 异地备份部分失败 ${file.url}：`, synced.failed)
                    }
                } else if (result.reason !== 'missing') {
                    backupFailedCount += 1
                }
            } catch (err) {
                backupFailedCount += 1
                console.error(`[File] 备份文件失败 ${file.url}：`, err.message)
            }
        }

        writeSystemLog({
            userId: req.user?.userId ?? null,
            action: 'delete',
            module: 'file',
            targetType: 'file',
            targetId: null,
            detail: `删除 ${deleted} 个文件，备份 ${backedUpCount} 个`,
            ip: req.ip || null,
        })

        res.json({
            code: 200,
            message: '删除成功',
            data: {
                deletedCount: deleted,
                backedUpCount,
                backupFailedCount,
                offsiteFailedCount,
                referencedCount: referenced.length,
                referenced
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件删除失败：' + err.message })
    }
}

/**
 * 回收站列表：只返回仍保留备份、可恢复的逻辑删除文件。
 */
async function getTrashFiles(req, res) {
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
        const { list, total } = await fileModel.getDeletedFilesByPage({
            keyword: keyword || undefined,
            pageSize,
            offset
        })

        const formatted = await Promise.all(list.map(async (item) => ({
            id: item.id,
            fileName: item.file_name,
            format: item.format,
            size: item.size,
            url: item.source_image_id
                ? `/api/uploads/${item.file_name}`
                : toAccessUrl(item.id, item.url),
            subsetId: item.subset_id,
            createdAt: item.created_at,
            deletedAt: item.deleted_at,
            // 内容图片本体在 image 表里，恢复时把 image 状态改回即可。
            recoverable: item.source_image_id
                ? Boolean(await imageModel.findImageById(item.source_image_id))
                : fileStorage.isRemoteUrl(item.url)
                || await fileStorage.backupExists(item.url)
        })))

        res.json({
            code: 200,
            message: '获取回收站成功',
            data: {
                total,
                page,
                pageSize,
                totalPage: Math.ceil(total / pageSize),
                list: formatted
            }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '获取回收站失败：' + err.message })
    }
}

/**
 * 批量恢复回收站文件。本地文件先从非公开备份区移回，再恢复数据库状态。
 */
async function restoreFiles(req, res) {
    try {
        const ids = normalizeIdList(req.body.fileIds)
        if (ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请选择要恢复的文件' })
        }

        const files = await fileModel.findFilesByIds(ids)
        const recoverable = files.filter(
            file => Number(file.status) === 0 && !file.backup_deleted_at
        )
        if (recoverable.length === 0) {
            return res.status(404).json({ code: 404, message: '没有可恢复的文件' })
        }

        let restoredCount = 0
        const failed = []

        for (const file of recoverable) {
            // 内容图片：恢复的是 image 表状态，没有磁盘文件要搬。
            if (file.source_image_id) {
                const affected = await fileModel.restoreFile(file.id)
                if (affected !== 1) {
                    failed.push({ id: file.id, reason: 'record_not_restorable' })
                    continue
                }
                await imageModel.restoreImageById(file.source_image_id)
                restoredCount += 1
                continue
            }

            let diskRestored = false
            if (!fileStorage.isRemoteUrl(file.url)) {
                try {
                    // 本地备份可能已被清理，先尝试从跨盘镜像/S3 拉回
                    if (!await fileStorage.backupExists(file.url)) {
                        await offsiteStorage.restoreToBackup(file.url)
                    }
                    const result = await fileStorage.restoreFromBackup(file.url)
                    if (!result.restored && result.reason !== 'already_active') {
                        failed.push({ id: file.id, reason: result.reason || 'restore_failed' })
                        continue
                    }
                    diskRestored = result.restored
                } catch (err) {
                    failed.push({ id: file.id, reason: err.message })
                    continue
                }
            }

            const affected = await fileModel.restoreFile(file.id)
            if (affected !== 1) {
                if (diskRestored) {
                    await fileStorage.moveToBackup(file.url).catch(() => {})
                }
                failed.push({ id: file.id, reason: 'record_not_restorable' })
                continue
            }
            restoredCount += 1
        }

        if (restoredCount > 0) {
            writeSystemLog({
                userId: req.user?.userId ?? null,
                action: 'update',
                module: 'file',
                targetType: 'file',
                targetId: null,
                detail: `从回收站恢复 ${restoredCount} 个文件`,
                ip: req.ip || null,
            })
        }

        const statusCode = restoredCount > 0 ? 200 : 409
        res.status(statusCode).json({
            code: restoredCount > 0 ? 200 : 409,
            message: restoredCount > 0 ? '恢复完成' : '文件恢复失败',
            data: { restoredCount, failedCount: failed.length, failed }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件恢复失败：' + err.message })
    }
}

/**
 * 管理员手动触发文件生命周期清理，定时任务与这里共用同一实现。
 */
async function cleanupFiles(req, res) {
    try {
        if (!hasPermission(req.user, 'file.purge')) {
            return res.status(403).json({ code: 403, message: '当前账号没有执行文件清理的权限' })
        }

        const result = await runFileLifecycleCleanup({
            dryRun: req.body?.dryRun === true
        })
        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'file',
            targetType: 'file',
            targetId: null,
            detail: result.dryRun
                ? '预演文件生命周期清理'
                : `清理孤儿文件 ${result.removedOrphans} 个，过期备份 ${result.removedExpiredBackups} 个`,
            ip: req.ip || null,
        })

        res.json({ code: 200, message: result.dryRun ? '清理预演完成' : '清理完成', data: result })
    } catch (err) {
        res.status(500).json({ code: 500, message: '文件清理失败：' + err.message })
    }
}

/**
 * 彻底删除回收站文件：物理删除非公开备份，并标记备份已清理。
 * 仅管理员可执行，避免误删后无法恢复。
 */
async function purgeTrashFiles(req, res) {
    try {
        if (!hasPermission(req.user, 'file.purge')) {
            return res.status(403).json({ code: 403, message: '当前账号没有彻底删除文件的权限' })
        }

        const ids = normalizeIdList(req.body.fileIds)
        if (ids.length === 0) {
            return res.status(400).json({ code: 400, message: '请选择要彻底删除的文件' })
        }

        const files = await fileModel.findFilesByIds(ids)
        const candidates = files.filter(
            file => Number(file.status) === 0 && !file.backup_deleted_at
        )
        if (candidates.length === 0) {
            return res.status(404).json({ code: 404, message: '没有可彻底删除的文件' })
        }

        let purgedCount = 0
        const failed = []
        const purgedIds = []

        // 被文章/图库/随笔引用的文件进入回收站后，不能直接物理删除；
        // 先移除内容引用，再回到回收站执行彻底删除。
        for (const file of candidates) {
            const referenceCount = file.source_image_id
                ? await imageModel.countImageReferencesWithBinding(file.file_name)
                : await fileModel.countFileReferences(file.id)
            if (referenceCount > 0) {
                failed.push({
                    id: file.id,
                    reason: 'referenced_by_content',
                    referenceCount
                })
                continue
            }

            // 内容图片彻底删除：连同 image 表里的二进制一起移除。
            if (file.source_image_id) {
                await imageModel.deleteImageById(file.source_image_id)
                purgedIds.push(file.id)
                continue
            }

            if (!fileStorage.isRemoteUrl(file.url)) {
                // 先清理异地副本；异地失败时本地仍可恢复，避免留下不可恢复的半状态。
                const offsiteResult = await offsiteStorage.remove(file.url)
                if (offsiteResult.failed.length > 0) {
                    failed.push({
                        id: file.id,
                        reason: 'offsite_remove_failed',
                        details: offsiteResult.failed
                    })
                    continue
                }
            }

            if (!fileStorage.isRemoteUrl(file.url)) {
                try {
                    await fileStorage.removeBackup(file.url)
                } catch (err) {
                    failed.push({ id: file.id, reason: err.message })
                    continue
                }
            }
            purgedIds.push(file.id)
        }

        if (purgedIds.length > 0) {
            await fileModel.markBackupDeleted(purgedIds)
            purgedCount = purgedIds.length
        }

        if (purgedCount > 0) {
            writeSystemLog({
                userId: req.user.userId,
                action: 'delete',
                module: 'file',
                targetType: 'file',
                targetId: null,
                detail: `彻底删除 ${purgedCount} 个回收站文件`,
                ip: req.ip || null,
            })
        }

        const statusCode = purgedCount > 0 ? 200 : 409
        res.status(statusCode).json({
            code: purgedCount > 0 ? 200 : 409,
            message: purgedCount > 0 ? '彻底删除完成' : '彻底删除失败',
            data: { purgedCount, failedCount: failed.length, failed }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '彻底删除失败：' + err.message })
    }
}

/**
 * 备份区容量与异地副本配置状态，仅管理员可见。
 */
async function getStorageStatus(req, res) {
    try {
        if (!hasPermission(req.user, 'file.purge')) {
            return res.status(403).json({ code: 403, message: '当前账号没有查看备份存储状态的权限' })
        }

        const capacity = await getBackupCapacity({ offsite: offsiteStorage })
        res.json({ code: 200, message: '查询成功', data: capacity })
    } catch (err) {
        res.status(500).json({ code: 500, message: '备份存储状态查询失败：' + err.message })
    }
}

/**
 * 存储维护面板：缩略图缓存命中率与磁盘/内容图片/回收站占用分布。
 */
async function getMaintenanceStats(req, res) {
    try {
        if (!hasPermission(req.user, 'file.purge')) {
            return res.status(403).json({ code: 403, message: '当前账号没有查看存储维护信息的权限' })
        }

        const storage = await fileModel.getStorageDistribution()
        res.json({
            code: 200,
            message: '查询成功',
            data: { cache: variantCacheInfo(), storage }
        })
    } catch (err) {
        res.status(500).json({ code: 500, message: '存储维护信息查询失败：' + err.message })
    }
}

/**
 * 手动清空缩略图缓存：下次请求会按需重新生成 WebP 变体。
 */
async function clearVariantCacheAction(req, res) {
    try {
        if (!hasPermission(req.user, 'file.purge')) {
            return res.status(403).json({ code: 403, message: '当前账号没有清理缩略图缓存的权限' })
        }

        const cache = clearVariantCache()
        writeSystemLog({
            userId: req.user.userId,
            action: 'delete',
            module: 'file',
            targetType: 'file',
            targetId: null,
            detail: '手动清理图片缩略图缓存',
            ip: req.ip || null,
        })

        res.json({ code: 200, message: '缩略图缓存已清理', data: { cache } })
    } catch (err) {
        res.status(500).json({ code: 500, message: '缩略图缓存清理失败：' + err.message })
    }
}

module.exports = {
    getFiles,
    getFileSummary,
    getImageFiles,
    uploadFile,
    downloadFile,
    getRawImage,
    moveFiles,
    deleteFiles,
    getTrashFiles,
    restoreFiles,
    cleanupFiles,
    purgeTrashFiles,
    getStorageStatus,
    getMaintenanceStats,
    clearVariantCacheAction
}
