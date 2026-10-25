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
        `SELECT f.id, f.file_name, f.format, f.size, f.url, f.subset_id, f.created_at
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
        'SELECT id, file_name, format, size, url, subset_id, status FROM file WHERE id = ? LIMIT 1',
        [id]
    )
    return rows[0] || null
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
        `UPDATE file SET status = 0 WHERE status = 1 AND id IN (${placeholders})`,
        ids
    )
    return result.affectedRows
}

module.exports = {
    getFilesByPage,
    countFilesSummary,
    getSubsetCounts,
    findFileById,
    findExistingFileIds,
    insertFile,
    updateFileSubset,
    softDeleteFiles
}
