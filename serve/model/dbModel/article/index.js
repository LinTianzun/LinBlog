const { query } = require('../../db/dbnew')

//  校验文章是否存在（仅查ID和状态）
async function findAtricleById(articleId) {
    const sql = 'SELECT id, state FROM article WHERE id = ?'
    return query(sql, [articleId])
}

module.exports = {
    findAtricleById
}