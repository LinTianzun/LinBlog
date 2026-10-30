const db = require('../../db/dbnew')

function createImage({ filename, mimeType, size, checksum, data, userId }) {
    return db.query(
        `INSERT INTO image
            (filename, mime_type, size, checksum, data, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [filename, mimeType, size, checksum, data, userId ?? null]
    )
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

// 无引用的图片行软删，有引用的保留（例如用户换回旧封面的场景）。
async function deactivateImageIfUnreferenced(filename, exec = db.query) {
    const rows = await countImageReferences(filename, exec)
    const referenceCount = Number(rows?.[0]?.referenceCount ?? 0)
    if (referenceCount > 0) {
        return { referenceCount, deactivated: false }
    }

    await exec(
        'UPDATE image SET status = 0 WHERE filename = ? AND status = 1',
        [filename]
    )
    return { referenceCount: 0, deactivated: true }
}

module.exports = { createImage, findActiveImageByFilename, deactivateImageIfUnreferenced }
