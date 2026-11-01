const db = require('../../db/dbnew')

function createImage({ filename, mimeType, size, checksum, data, userId }) {
    return db.query(
        `INSERT INTO image
            (filename, mime_type, size, checksum, data, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [filename, mimeType, size, checksum, data, userId ?? null]
    ).then((result) => ({ imageId: result.insertId }))
}

function findActiveImageByFilename(filename) {
    return db.query(
        `SELECT id, filename, mime_type, size, checksum, data, user_id
         FROM image
         WHERE filename = ? AND status = 1
         LIMIT 1`,
        [filename]
    )
}

function findImageById(id) {
    return db.query(
        `SELECT id, filename, mime_type, size, checksum, data, user_id, status, created_at
         FROM image
         WHERE id = ?
         LIMIT 1`,
        [id]
    ).then((rows) => rows[0] || null)
}

// 软删图片本体：内容图片没有独立磁盘备份区，
// 与「本地文件」聚合记录一起标记为已删除即可回收站可恢复。
function deactivateImageById(id) {
    return db.query(
        'UPDATE image SET status = 0 WHERE id = ? AND status = 1',
        [id]
    )
}

function restoreImageById(id) {
    return db.query(
        'UPDATE image SET status = 1 WHERE id = ? AND status = 0',
        [id]
    )
}

// 彻底删除：从库里移除二进制本体，不可恢复。
function deleteImageById(id) {
    return db.query(
        'DELETE FROM image WHERE id = ?',
        [id]
    )
}

// 统计一张图片仍被业务数据引用的数量：文章封面/内容（含未发布的工作稿）、
// 日记图片、用户头像。工作稿必须一起统计，否则草稿里引用的图片会被当成孤儿软删。
function countImageReferences(filename, exec = db.query) {
    const pattern = `%${filename}%`
    return exec(
        `SELECT
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND cover LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND content LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_content LIKE ?) +
            (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_payload LIKE ?) +
            (SELECT COUNT(*) FROM diary WHERE status = 1 AND picture LIKE ?) +
            (SELECT COUNT(*) FROM users WHERE imgurl LIKE ?) AS referenceCount`,
        [pattern, pattern, pattern, pattern, pattern, pattern]
    )
}

// countImageReferences 的数值化封装，便于控制器直接判断能否删除。
async function countImageReferencesByFilename(filename, exec = db.query) {
    const rows = await countImageReferences(filename, exec)
    return Number(rows?.[0]?.referenceCount ?? 0)
}

/**
 * 图片的总引用数：既统计 /api/uploads/:filename 形态的直接引用，
 * 也统计通过「本地文件」聚合行引用（/api/file/:id/raw）的情况。
 * 只统计前者会把素材库复用的图片误判成孤儿。
 */
async function countImageReferencesWithBinding(filename, exec = db.query) {
    let total = await countImageReferencesByFilename(filename, exec)
    const bindings = await exec(
        'SELECT id FROM file WHERE source_image_id IN (SELECT id FROM image WHERE filename = ?)',
        [filename]
    )
    for (const binding of bindings || []) {
        if (!binding?.id) continue
        const pattern = `%/api/file/${binding.id}/raw%`
        const rows = await exec(
            `SELECT
                (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND cover LIKE ?) +
                (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND content LIKE ?) +
                (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_content LIKE ?) +
                (SELECT COUNT(*) FROM article WHERE state != 'deleted' AND draft_payload LIKE ?) +
                (SELECT COUNT(*) FROM diary WHERE status = 1 AND picture LIKE ?) +
                (SELECT COUNT(*) FROM users WHERE imgurl LIKE ?) AS referenceCount`,
            [pattern, pattern, pattern, pattern, pattern, pattern]
        )
        total += Number(rows?.[0]?.referenceCount ?? 0)
    }
    return total
}

// 无引用的图片行软删，有引用的保留（例如用户换回旧封面的场景）。
// 同步软删「本地文件」里的聚合记录，否则列表里会留下裂图。
async function deactivateImageIfUnreferenced(filename, exec = db.query) {
    const referenceCount = await countImageReferencesWithBinding(filename, exec)
    if (referenceCount > 0) {
        return { referenceCount, deactivated: false }
    }

    await exec(
        'UPDATE image SET status = 0 WHERE filename = ? AND status = 1',
        [filename]
    )
    await exec(
        `UPDATE file
         SET status = 0, deleted_at = NOW(), backup_deleted_at = NULL
         WHERE source_image_id IN (SELECT id FROM image WHERE filename = ?)
           AND status = 1`,
        [filename]
    )
    return { referenceCount: 0, deactivated: true }
}

module.exports = {
    createImage,
    findActiveImageByFilename,
    findImageById,
    deactivateImageById,
    restoreImageById,
    deleteImageById,
    countImageReferencesByFilename,
    countImageReferencesWithBinding,
    deactivateImageIfUnreferenced
}
