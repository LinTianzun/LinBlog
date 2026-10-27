const { query } = require('../../db/dbnew')

const CLASSIFY_TYPES = ['article', 'image', 'resource']

async function findSubsets({ classify, includeCount = false, countClassify, countState } = {}) {
    const whereParams = []
    let whereClause = 'status = 1'

    if (classify && CLASSIFY_TYPES.includes(classify)) {
        whereClause += ' AND classify = ?'
        whereParams.push(classify)
    }

    let columns = 'id, subset_name AS name, classify, sort, created_at AS moment'
    const countParams = []
    if (includeCount) {
        //  countClassify 指定统计哪类内容；图库共用文章分组但只统计图片集
        let countFilter = ''
        if (countClassify && ['article', 'image'].includes(countClassify)) {
            countFilter = ' AND a.classify = ?'
            countParams.push(countClassify)
        }
        //  countState 限定统计哪些状态的内容；门户只统计已发布，后台统计全部未删除
        if (countState && ['draft', 'published', 'rejected'].includes(countState)) {
            countFilter += ' AND a.state = ?'
            countParams.push(countState)
        }
        columns = `id, subset_name AS name, classify, sort,
           (SELECT COUNT(*) FROM article a
             WHERE a.subset_id = subset.id AND a.state != 'deleted'${countFilter}) AS value,
           created_at AS moment`
    }

    return query(
        `SELECT ${columns} FROM subset WHERE ${whereClause} ORDER BY sort DESC, id ASC`,
        [...countParams, ...whereParams]
    )
}

async function findSubsetById(id) {
    const rows = await query('SELECT id, subset_name, classify, sort, status FROM subset WHERE id = ? LIMIT 1', [id])
    return rows[0] || null
}

async function findSubsetByNameAndClassify(name, classify, { includeDeleted = false } = {}) {
    const sql = includeDeleted
        ? 'SELECT id, status FROM subset WHERE subset_name = ? AND classify = ? LIMIT 1'
        : 'SELECT id, status FROM subset WHERE subset_name = ? AND classify = ? AND status = 1 LIMIT 1'
    const rows = await query(sql, [name, classify])
    return rows[0] || null
}

async function insertSubset({ name, classify, sort = 0 }) {
    const result = await query(
        'INSERT INTO subset (subset_name, classify, sort) VALUES (?, ?, ?)',
        [name, classify, sort]
    )
    return { subsetId: result.insertId }
}

async function reviveSubset(id, { sort = 0 } = {}) {
    const result = await query(
        'UPDATE subset SET status = 1, sort = ? WHERE id = ? AND status = 0',
        [sort, id]
    )
    return result.affectedRows
}

async function removeInactiveDuplicates(name, classify) {
    const result = await query(
        'DELETE FROM subset WHERE subset_name = ? AND classify = ? AND status = 0',
        [name, classify]
    )
    return result.affectedRows
}

async function updateSubset(id, { name, sort }) {
    const fields = []
    const params = []

    if (name !== undefined) {
        fields.push('subset_name = ?')
        params.push(name)
    }
    if (sort !== undefined) {
        fields.push('sort = ?')
        params.push(sort)
    }
    if (fields.length === 0) return 0

    params.push(id)
    const result = await query(`UPDATE subset SET ${fields.join(', ')} WHERE id = ?`, params)
    return result.affectedRows
}

async function softDeleteSubset(id) {
    const result = await query(
        'UPDATE subset SET status = 0 WHERE id = ? AND status = 1',
        [id]
    )
    return result.affectedRows
}

async function countArticlesBySubset(id) {
    const rows = await query(
        "SELECT COUNT(*) AS total FROM article WHERE subset_id = ? AND state != 'deleted'",
        [id]
    )
    return rows[0]?.total ?? 0
}

module.exports = {
    CLASSIFY_TYPES,
    findSubsets,
    findSubsetById,
    findSubsetByNameAndClassify,
    insertSubset,
    reviveSubset,
    removeInactiveDuplicates,
    updateSubset,
    softDeleteSubset,
    countArticlesBySubset
}
