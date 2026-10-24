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

module.exports = { createImage, findActiveImageByFilename }
