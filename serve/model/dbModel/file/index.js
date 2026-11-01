const { query } = require('../../db/dbnew')

/**
 * 分页查询文件（支持按分组、未分类、文件名关键词筛选）
 */
async function getFilesByPage({ subsetId, uncategorized, keyword, pageSize, offset }) {
    //  未分类口径与分类栏统计保持一致：未归属或归属到非资源/已删除分组
    const unclassifiedSql = `(f.subset_id IS NULL OR s.classify IS NULL OR s.classify <> 'resource' OR s.status <> 1)`
    const where = ['f.status = 1']
    const params = []

    if (subsetId) {
        where.push('f.subset_id = ?')
        params.push(subsetId)
    }

    if (uncategorized) {
        where.push(unclassifiedSql)
    }

    if (keyword) {
        where.push('f.file_name LIKE ?')
        params.push(`%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`

    const totalRows = await query(
        `SELECT COUNT(*) AS total
         FROM file f
         LEFT JOIN subset s ON f.subset_id = s.id
         ${whereSql}`,
        params
    )

    const list = await query(
        `SELECT f.id, f.file_name, f.format, f.size, f.url, f.subset_id, f.created_at, f.source_image_id
         FROM file f
         LEFT JOIN subset s ON f.subset_id = s.id
         ${whereSql}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

/**
 * 内容图片（文章/图库/随笔上传）聚合为 file 记录。
 * image 表保存二进制本体，file 只保存展示元数据；
 * url 暂留空，实际展示走 /api/uploads/:filename。
 */
async function getImageBindingsByPage({ keyword, pageSize, offset }) {
    const where = ['f.status = 1', 'f.source_image_id IS NOT NULL']
    const params = []

    if (keyword) {
        where.push('f.file_name LIKE ?')
        params.push(`%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const totalRows = await query(
        `SELECT COUNT(*) AS total
         FROM file f
         ${whereSql}`,
        params
    )
    const list = await query(
        `SELECT f.id, f.file_name, f.format, f.size, f.source_image_id, f.created_at
         FROM file f
         ${whereSql}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

async function findImageBindingByImageId(imageId) {
    const rows = await query(
        `SELECT id, file_name, format, size, url, source_image_id, status, created_at
         FROM file
         WHERE source_image_id = ?
         LIMIT 1`,
        [imageId]
    )
    return rows[0] || null
}

/**
 * 文件总数、总大小与未分类数（用于分组栏统计与总览卡片）
 * SUM(size) 对空表返回 NULL，需归一为 0
 */
async function countFilesSummary() {
    const rows = await query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(f.size), 0) AS totalSize,
                SUM(CASE WHEN s.classify = 'resource' AND s.status = 1 THEN 1 ELSE 0 END) AS categorized
         FROM file f
         LEFT JOIN subset s ON f.subset_id = s.id
         WHERE f.status = 1`
    )
    const row = rows[0] || {}
    const total = Number(row.total || 0)
    const categorized = Number(row.categorized || 0)
    return {
        total,
        totalSize: Number(row.totalSize || 0),
        uncategorized: Math.max(total - categorized, 0)
    }
}

/**
 * 按分组统计文件数量（供分类栏展示计数，只统计资源类分组）
 */
async function getSubsetCounts() {
    const rows = await query(
        `SELECT s.id, s.subset_name AS name, s.classify, s.sort,
                s.created_at AS moment,
                COUNT(f.id) AS total
         FROM subset s
         LEFT JOIN file f ON f.subset_id = s.id AND f.status = 1
         WHERE s.status = 1 AND s.classify = 'resource'
         GROUP BY s.id, s.subset_name, s.classify, s.sort, s.created_at
         ORDER BY s.sort DESC, s.id ASC`
    )
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        classify: row.classify,
        sort: row.sort,
        moment: row.moment,
        value: Number(row.total)
    }))
}

async function findFileById(id) {
    const rows = await query(
        `SELECT id, file_name, format, size, url, subset_id, status, created_at, source_image_id,
                deleted_at, backup_deleted_at
         FROM file
         WHERE id = ?
         LIMIT 1`,
        [id]
    )
    return rows[0] || null
}

async function insertImageBinding({ fileName, format, size, sourceImageId, subsetId = null }) {
    const result = await query(
        `INSERT INTO file
            (file_name, format, size, url, subset_id, source_image_id)
         VALUES (?, ?, ?, '', ?, ?)`,
        [fileName, format, size ?? null, subsetId ?? null, sourceImageId]
    )
    return { fileId: result.insertId }
}

/**
 * 素材库图片列表：只返回图片类扩展名且未删除的文件。
 * 扩展名白名单与 uploadController 的 MIME 白名单保持一致，
 * 避免把视频/压缩包等非图片混进选择器。
 */
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']

async function getImageFilesByPage({ keyword, pageSize, offset }) {
    const where = ["f.status = 1", `f.format IN (${IMAGE_FORMATS.map(() => '?').join(', ')})`]
    const params = [...IMAGE_FORMATS]

    if (keyword) {
        where.push('f.file_name LIKE ?')
        params.push(`%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`

    const totalRows = await query(
        `SELECT COUNT(*) AS total FROM file f ${whereSql}`,
        params
    )

    const list = await query(
        `SELECT f.id, f.file_name, f.format, f.size, f.url, f.subset_id, f.created_at, f.source_image_id,
                s.subset_name AS subsetName
        FROM file f
        LEFT JOIN subset s ON f.subset_id = s.id
        ${whereSql}
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

/**
 * 统计某个本地文件被业务内容引用的次数。
 * 引用 URL 形如 /api/file/12/raw，按 URL 精确匹配文件 id，
 * 命中文章封面/正文（含工作稿）、随笔图片与用户头像。
 */
async function countFileReferences(fileId) {
    const pattern = `%/api/file/${fileId}/raw%`
    const rows = await query(
        `SELECT
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND cover LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND content LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_content LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_payload LIKE ?) +
            (SELECT COUNT(*) FROM diary WHERE status = 1 AND picture LIKE ?) +
            (SELECT COUNT(*) FROM users WHERE imgurl LIKE ?) AS referenceCount`,
        [pattern, pattern, pattern, pattern, pattern, pattern]
    )
    return Number(rows?.[0]?.referenceCount ?? 0)
}

async function findFilesByIds(ids) {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(', ')
    return query(
        `SELECT id, file_name, format, size, url, subset_id, status, created_at, source_image_id,
                deleted_at, backup_deleted_at
         FROM file
         WHERE id IN (${placeholders})`,
        ids
    )
}

/**
 * 批量归属校验：确认文件都存在且未删除
 */
async function findExistingFileIds(ids) {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(', ')
    const rows = await query(
        `SELECT id FROM file WHERE status = 1 AND id IN (${placeholders})`,
        ids
    )
    return rows.map(row => Number(row.id))
}

async function insertFile({ fileName, format, size, url, subsetId }) {
    const result = await query(
        'INSERT INTO file (file_name, format, size, url, subset_id) VALUES (?, ?, ?, ?, ?)',
        [fileName, format, size ?? null, url, subsetId ?? null]
    )
    return { fileId: result.insertId }
}

async function updateFileSubset(id, subsetId) {
    const result = await query(
        'UPDATE file SET subset_id = ? WHERE id = ? AND status = 1',
        [subsetId ?? null, id]
    )
    return result.affectedRows
}

async function softDeleteFiles(ids) {
    if (!ids.length) return 0
    const placeholders = ids.map(() => '?').join(', ')
    const result = await query(
        `UPDATE file
         SET status = 0, deleted_at = NOW(), backup_deleted_at = NULL
         WHERE status = 1 AND id IN (${placeholders})`,
        ids
    )
    return result.affectedRows
}

async function restoreFile(id) {
    const result = await query(
        `UPDATE file
         SET status = 1, deleted_at = NULL, backup_deleted_at = NULL
         WHERE id = ? AND status = 0 AND backup_deleted_at IS NULL`,
        [id]
    )
    return result.affectedRows
}

async function markBackupDeleted(ids) {
    if (!ids.length) return 0
    const placeholders = ids.map(() => '?').join(', ')
    const result = await query(
        `UPDATE file
         SET backup_deleted_at = NOW()
         WHERE backup_deleted_at IS NULL AND id IN (${placeholders})`,
        ids
    )
    return result.affectedRows
}

async function findLocalFileReferences() {
    return query(
        `SELECT id, url, status
         FROM file
         WHERE LOWER(url) NOT LIKE 'http://%' AND LOWER(url) NOT LIKE 'https://%'`
    )
}

async function findExpiredDeletedFiles(days, limit = 500) {
    return query(
        `SELECT id, url, source_image_id
         FROM file
         WHERE status = 0
           AND deleted_at IS NOT NULL
           AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)
           AND backup_deleted_at IS NULL
         ORDER BY deleted_at ASC
         LIMIT ?`,
        [days, limit]
    )
}

async function getDeletedFilesByPage({ keyword, pageSize, offset }) {
    const where = ['status = 0', 'backup_deleted_at IS NULL']
    const params = []
    if (keyword) {
        where.push('file_name LIKE ?')
        params.push(`%${keyword}%`)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const totalRows = await query(`SELECT COUNT(*) AS total FROM file ${whereSql}`, params)
    const list = await query(
        `SELECT id, file_name, format, size, url, subset_id, created_at, source_image_id,
                deleted_at, backup_deleted_at
         FROM file
         ${whereSql}
         ORDER BY deleted_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
    )

    return { list, total: Number(totalRows[0]?.total || 0) }
}

module.exports = {
    getFilesByPage,
    getImageBindingsByPage,
    findImageBindingByImageId,
    countFilesSummary,
    getSubsetCounts,
    findFileById,
    getImageFilesByPage,
    countFileReferences,
    findFilesByIds,
    findExistingFileIds,
    insertFile,
    insertImageBinding,
    updateFileSubset,
    softDeleteFiles,
    restoreFile,
    markBackupDeleted,
    findLocalFileReferences,
    findExpiredDeletedFiles,
    getDeletedFilesByPage
}
